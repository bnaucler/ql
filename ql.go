package main

import (
    "fmt"
    "log"
    "time"
    "slices"
    "strings"
    "net/http"
    "math/rand"
    "encoding/json"

    bolt "go.etcd.io/bbolt"
    bcrypt "golang.org/x/crypto/bcrypt"
)

const PORT = 9955
const DBNAME = "./data/ql.db"

const CLEANCHECK = 1 * time.Hour    // Time interval to check for inactive items
const KEEPTIME = 120 * time.Hour    // How long to keep item after closing

const MINPASSLEN = 4        // Minimum password length

const SKLEN = 30            // Skey length
const IDLEN = 15            // ID length
const SKNUM = 5             // Max number of concurrent skeys

const HOMENAME = "home"     // Name for root/head list

var GLOB = []byte("glob")   // Global settings
var IBUC = []byte("lbuc")   // Item bucket
var UBUC = []byte("ubuc")   // User bucket

type Index struct {
    User []string           // All usernames in DB
    Item []string           // All item IDs in DB
}

type Apicall struct {
    ID string               // Id of item to process
    Action string           // Requested action
    Value string            // Name of item to process
    Type string             // Data type
    Uname string            // Username
    Fname string            // Username
    Lname string            // Username
    Pass string             // Password
    Skey string             // Session key
    Cpos string             // Current list
}

type Resp struct {
    Status int              // Status code
    Err string              // Error message
    Head Item               // Current head / list
    Hstr string             // Header title
    Contents []Item         // List contents
    User User               // Current user
    Ulist []User            // User list (or w/o access to object)
    Umembers []User         // Users with access to object
    Ref string              // String for general reference
}

type User struct {
    Uname string            // Username
    Pass []byte             // Encrypted password
    Skey []string           // Session keys
    Fname string            // First name
    Lname string            // Last name
    Cpos string             // Current list
    Root string             // Root item ID
    Inactive bool           // Showing inactive items
}

type Item struct {
    ID string               // Item ID
    Parent string           // Parent item id (blank if at root)
    Contents []string       // Items contained (if list)
    Owner string            // Owner username
    Members []string        // Other users with access to item
    Type string             // Item or list
    Active bool             // Item visible
    Value string            // Item name
    CTime time.Time         // Time of creation
    ETime time.Time         // End time (item closed)
}

// Log all errors
func cherr(e error) error {
    if e != nil { log.Println(e) }
    return e
}

// Create random string of length ln
func randstr(ln int) (string){

    const charset = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ"
    var cslen = len(charset)

    b := make([]byte, ln)
    for i := range b { b[i] = charset[rand.Intn(cslen)] }

    return string(b)
}

// Write JSON encoded byte slice to DB
func wrdb(db *bolt.DB, k []byte, v []byte, cbuc []byte) (e error) {

    e = db.Update(func(tx *bolt.Tx) error {
        b, e := tx.CreateBucketIfNotExists(cbuc)
        if e != nil { return e }

        e = b.Put(k, v)
        if e != nil { return e }

        return nil
    })
    return
}

// Return JSON encoded byte slice from DB
func rdb(db *bolt.DB, k []byte, cbuc []byte) (v []byte, e error) {

    e = db.View(func(tx *bolt.Tx) error {
        b := tx.Bucket(cbuc)
        if b == nil { return fmt.Errorf("No bucket!") }

        v = b.Get(k)
        if len(v) < 1 { return fmt.Errorf("No data!") }

        return nil
    })
    return
}

// Deletes item from database permanently
func ddb(db *bolt.DB, k []byte, cbuc []byte) (e error) {

    e = db.Update(func(tx *bolt.Tx) error {
        b, e := tx.CreateBucketIfNotExists(cbuc)
        if e != nil { return e }

        e = b.Delete(k)
        if e != nil { return e }

        return nil
    })
    return
}

// Retrieves master index from database
func getmasterindex(db *bolt.DB) Index {

    i := Index{}
    btindex, e := rdb(db, []byte(GLOB), GLOB)

    if e == nil { e = json.Unmarshal(btindex, &i) }

    return i
}

// Stores master index in database
func wrmasterindex(db *bolt.DB, i Index) {

    bti, e := json.Marshal(i)
    cherr(e)

    e = wrdb(db, []byte(GLOB), bti, GLOB)
    cherr(e)
}

// Adds item ID to master index
func itemtomaster(db *bolt.DB, iid string) {

    i := getmasterindex(db)
    i.Item = append(i.Item, iid)
    wrmasterindex(db, i)
}

// Adds user to master index
func usertomaster(db *bolt.DB, uid string) {

    i := getmasterindex(db)
    i.User = append(i.User, uid)
    wrmasterindex(db, i)
}

// Removes item ID from master index
func rmitemfrommaster(db *bolt.DB, iid string) {

    i := getmasterindex(db)
    ni := []string{}

    for _, id := range i.Item {
        if id != iid { ni = append(ni, id) }
    }

    i.Item = ni
    wrmasterindex(db, i)
}

// Retrieves user object from database
func getuser(db *bolt.DB, uname string) User {

    u := User{}

    btuser, e := rdb(db, []byte(uname), UBUC)

    if e == nil {
        e = json.Unmarshal(btuser, &u)
    }

    return u
}

// Processes API call
func getcall(r *http.Request) Apicall {

    e := r.ParseForm()
    cherr(e)

    ret := Apicall{
        ID:             r.FormValue("id"),
        Action:         r.FormValue("action"),
        Value:          r.FormValue("value"),
        Type:           r.FormValue("type"),
        Uname:          r.FormValue("uname"),
        Fname:          r.FormValue("fname"),
        Lname:          r.FormValue("lname"),
        Pass:           r.FormValue("pass"),
        Skey:           r.FormValue("skey"),
        Cpos:           r.FormValue("cpos"),
    }

    return ret
}

// Stores user object in database
func wruser(db *bolt.DB, u User) {

    fmt.Printf("DEBUG User to write: %+v\n\n", u)

    btu, e := json.Marshal(u)
    cherr(e)

    e = wrdb(db, []byte(u.Uname), btu, UBUC)
    cherr(e)
}

// Returns true if item exists in database
func itemexists(db *bolt.DB, iid string) bool {

    i, status := getitem(db, iid)

    if len(i.ID) > 0 && status == 0 { return true }

    return false
}

// Returns true if user exists in database
func userexists(db *bolt.DB, uid string) bool {

    u := getuser(db, uid)

    if len(u.Uname) > 0 { return true }

    return false
}

// Adds new user to database
func mkuser(db *bolt.DB, call Apicall) (User, int, string) {

    u := User{}
    status := 0
    err := "OK"

    if userexists(db, call.Uname) {
        status = 1
        err = "Username not available"
    }

    if status == 0 {
        u.Uname = strings.ToLower(call.Uname)
        u.Fname = call.Fname
        u.Lname = call.Lname
        u.Inactive = false

        if len(call.Pass) < MINPASSLEN {
            status = 1
            err = fmt.Sprintf("Password needs to be at least %d characters long", MINPASSLEN)

        } else {
            u.Pass, _ = bcrypt.GenerateFromPassword([]byte(call.Pass), bcrypt.DefaultCost)
            i := mkheaditem(db, u)

            u.Root = i.ID
            u.Cpos = i.ID

            u = addskey(db, u) // Also commits user to db
            usertomaster(db, u.Uname)
        }
    }

    if status != 0 {
        u = User{}
    }

    return u, status, err
}

// Adds new skey to slice, replacing the SKLEN:th oldest key
func addskey(db *bolt.DB, u User) User {

    u.Skey = append(u.Skey, randstr(SKLEN))

    if len(u.Skey) > SKNUM { u.Skey = u.Skey[1:] }

    wruser(db, u)

    return u
}

// Attempts user login
func loginuser(db *bolt.DB, call Apicall) (User, int, string) {

    u := getuser(db, strings.ToLower(call.Uname))
    status := 0
    err := "OK"

    e := bcrypt.CompareHashAndPassword(u.Pass, []byte(call.Pass))

    if e != nil {
        status = 1
        err = "Incorrect username / password"

    } else {
        u = addskey(db, u)
        u.Skey = u.Skey[len(u.Skey) - 1:]
        u.Cpos = u.Root
    }

    return u, status, err
}

// Processes request for skey validation
func valskey(db *bolt.DB, call Apicall) (User, int) {

    u := getuser(db, call.Uname)
    status := 1

    for _, v := range u.Skey {
        if v == call.Skey { status = 0 }
    }

    return u, status
}

// Changes user cpos to call request
func cspos(db *bolt.DB, call Apicall) (User, int) {

    // TODO skey
    u := getuser(db, call.Uname)
    status := 0

    u.Cpos = call.ID; // TODO error control
    wruser(db, u)

    return u, status
}

// Toggles user inactive setting
func toggleinactive(db *bolt.DB, call Apicall) (User, int) {

    // TODO skey
    u := getuser(db, call.Uname)
    status := 0

    if u.Inactive == false {
        u.Inactive = true

    } else {
        u.Inactive = false
    }

    wruser(db, u)

    return u, status
}

// Splits user list in members and non-members
func splituserlist(db *bolt.DB, iid string, tmplist []User) ([]User, []User) {

    ulist := []User{}
    umembers := []User{}

    ci, gis := getitem(db, iid)

    if gis == 0 {
        for _, tu := range tmplist {
            if tu.Uname == ci.Owner || existsinstringslice(tu.Uname, ci.Members) {
                umembers = append(umembers, tu)

            } else {
                ulist = append(ulist, tu)
            }
        }
    } else {
        ulist = tmplist
    }

    return ulist, umembers
}

// Returns user list based on search request TODO refactor
func getuserlist(db *bolt.DB, call Apicall) Resp {

    resp := Resp{}
    tmplist := []User{}

    resp.User, resp.Status = valskey(db, call)
    resp.Ref = call.ID

    mi := getmasterindex(db)
    tu := User{}

    if resp.Status == 0 {
        for _, uid := range mi.User {
            tu = getuser(db, uid)
            if strings.Contains(tu.Uname, call.Value) ||
               strings.Contains(tu.Fname, call.Value) ||
               strings.Contains(tu.Lname, call.Value) {
                   tu.Skey = []string{}
                   tu.Pass = []byte{}
                   tu.Cpos = ""
                   tu.Root = ""
                   tmplist = append(tmplist, tu)
            }
        }

        resp.Ulist, resp.Umembers = splituserlist(db, call.ID, tmplist)

    } else {
        resp.Err = "Key verification failed"
    }

    return resp
}

// Handles user related requests
func h_user(w http.ResponseWriter, r *http.Request, db *bolt.DB) {

    call := getcall(r)
    enc := json.NewEncoder(w)

    fmt.Printf("DEBUG User handler call: %+v\n\n", call)

    resp := Resp{}
    resp.Status = 0

    switch call.Action {
        case "get":
            resp = getuserlist(db, call)

        case "new":
            resp.User, resp.Status, resp.Err = mkuser(db, call)

        case "login":
            resp.User, resp.Status, resp.Err = loginuser(db, call)

        case "valskey":
            resp.User, resp.Status = valskey(db, call)

        case "cspos":
            resp.User, resp.Status = cspos(db, call)

        case "toggleinactive":
            resp.User, resp.Status = toggleinactive(db, call)

        default:
            resp.Status = 1
    }

    if call.Action != "login" && call.Action != "new" {
        resp.User.Skey = []string{}
    }

    if resp.Status != 0 {
        resp.Head = Item{}

    } else {
        if !itemexists(db, resp.User.Cpos) { resp.User.Cpos = resp.User.Root }
        resp.Head, resp.Status = getitem(db, resp.User.Cpos)
        resp.Contents, resp.Status = getcontents(db, resp.Head, resp.User.Inactive)
        resp.Hstr = getheader(db, resp.User.Cpos)
    }

    resp.User.Pass = []byte("")
    enc.Encode(resp)
}

// Retrieves item from database based on ID
func getitem(db *bolt.DB, callid string) (Item, int) {

    i := Item{}
    status := 0

    btitem, e := rdb(db, []byte(callid), IBUC)

    if e == nil {
        e = json.Unmarshal(btitem, &i)

    } else {
        status = 1
    }

    return i, status
}

// Stores item object in database
func writem(db *bolt.DB, i Item) {

    fmt.Printf("DEBUG Item to write: %+v\n\n", i)

    bti, e := json.Marshal(i)
    cherr(e)

    e = wrdb(db, []byte(i.ID), bti, IBUC)
    cherr(e)
}

// Adds item as child to specified parent
func setitemchild(db *bolt.DB, ci Item) Item {

    pi, _ := getitem(db, ci.Parent)
    pi.Contents = append(pi.Contents, ci.ID)
    writem(db, pi)

    return pi
}

// Creates root level item for (new) user
func mkheaditem(db *bolt.DB, u User) Item {

    i := Item{}
    i.Owner = u.Uname
    i.ID = randstr(IDLEN)
    i.Type = "list"
    i.CTime = time.Now()
    i.Active = true
    i.Value = HOMENAME

    writem(db, i) // TODO error handling

    return i
}

// Creates item ID and checks for collisions
func mkitemid(db *bolt.DB) string {

    id := randstr(IDLEN)
    _, status := getitem(db, id)

    if status == 0 { return mkitemid(db) }
    return id
}

// Creates new item
func mkitem(db *bolt.DB, val string, parent string, tp string, u User) (Item, int) {

    i := Item{}
    p, status := getitem(db, parent)

    i.ID = mkitemid(db)
    i.Value = val
    i.Parent = parent
    i.Owner = u.Uname
    i.CTime = time.Now()
    i.Active = true

    if tp == "item" || tp == "list" {
        i.Type = tp

    } else {
        status = 1
    }

    if status == 0 {
        itemtomaster(db, i.ID)
        writem(db, i)
        p = setitemchild(db, i)
    }

    return p, status
}

// Apicall wrapper for mkitem()
func mkitemfromcall(db *bolt.DB, call Apicall) (Item, int) {

    u := getuser(db, call.Uname)

    if len(u.Uname) < 1 { return Item{}, 1 } // TODO clean up

    i, status := mkitem(db, call.Value, call.Cpos, call.Type, u)

    return i, status
}

// Returns true if item is active
func checkactive(db *bolt.DB, iid string) bool {

    i, status := getitem(db, iid)

    if i.Active && status == 0 { return true }

    return false
}

func stripinactive(db *bolt.DB, ci Item) Item {

    litm := Item{}
    nc := []string{}

    for _, i := range ci.Contents {
        litm, _ = getitem(db, i)
        if litm.Active { nc = append(nc, i) }
    }

    ci.Contents = nc

    return ci
}

// Returns header string based on Cpos
func getheader(db *bolt.DB, cpos string) string {

    ret := ""
    vals := []string{}
    i := Item{}
    status := 0

    for status == 0 {
        i, status = getitem(db, cpos)
        if status == 0 {
            vals = append(vals, i.Value)
            cpos = i.Parent
        }
    }

    slices.Reverse(vals);
    ret = strings.Join(vals, "/")

    return ret
}

// Retrieves data objects from database based on parent
func getcontents(db *bolt.DB, head Item, inactive bool) ([]Item, int) {

    ret := []Item{}
    ci := Item{}
    status := 0

    for _, iid := range head.Contents {
        ci, status = getitem(db, iid)

        if status == 0 {
            if inactive {
                ret = append(ret, ci)

            } else if !inactive && checkactive(db, ci.ID) {
                if ci.Type == "list" { ci = stripinactive(db, ci) }
                ret = append(ret, ci)
            }
        }
    }

    return ret, status
}

// Sets requested items status to inactive
func toggleactive(db *bolt.DB, call Apicall) (Item, int) {

    i, status := getitem(db, call.ID)
    p, _ := getitem(db, call.Cpos)

    if status == 0 {
        if call.Action == "open" {
            i.Active = true
            i.ETime = time.Time{}

        } else {
            i.Active = false
            i.ETime = time.Now()
        }

        writem(db, i)
    }

    return p, status
}

// Toggles item type (item / list)
func toggletype(db *bolt.DB, call Apicall) (Item, int) {

    i, status := getitem(db, call.ID)
    p, _ := getitem(db, call.Cpos)

    if status == 0 {

        if i.Type == "list" {
            i.Type = "item"

        } else if i.Type == "item" {
            i.Type = "list"
        }

        writem(db, i)
    }

    return p, status
}

// Toggles item membership
func togglemember(db *bolt.DB, call Apicall) Resp {

    resp := Resp{}
    i, status := getitem(db, call.ID)
    resp.Status = status
    ux := userexists(db, call.Value)

    if resp.Status == 0 && ux == true {
        if call.Value == i.Owner {
            resp.Status = 1
            resp.Err = "Cannot remove item owner from member list"

        } else if existsinstringslice(call.Value, i.Members) {
            i.Members = rmkeyfromstringslice(call.Value, i.Members)
            writem(db, i)

        } else {
            i.Members = append(i.Members, call.Value)
            writem(db, i)
        }

        mi := getmasterindex(db)
        tmplist := []User{}

        for _, uid := range mi.User {
            tu := getuser(db, uid)
            tu.Pass = []byte("")
            tu.Skey = []string{}
            tmplist = append(tmplist, tu)
        }

        resp.Ulist, resp.Umembers = splituserlist(db, call.ID, tmplist)
        resp.Ref = call.ID

    } else {
        resp.Err = "Could not open requested object"
    }

    return resp
}

// Handles item related requests
func h_item(w http.ResponseWriter, r *http.Request, db *bolt.DB) {

    call := getcall(r)
    enc := json.NewEncoder(w)

    fmt.Printf("DEBUG Item handler call: %+v\n\n", call)

    resp := Resp{}
    resp.User, resp.Status = valskey(db, call)
    resp.User.Skey = []string{}

    if resp.Status == 0 {
        switch call.Action {
            case "get":
                resp.Head, resp.Status = getitem(db, call.ID)

            case "new":
                resp.Head, resp.Status = mkitemfromcall(db, call)

            case "open":
                resp.Head, resp.Status = toggleactive(db, call)

            case "close":
                resp.Head, resp.Status = toggleactive(db, call)

            case "toggletype":
                resp.Head, resp.Status = toggletype(db, call)

            case "togglemember":
                resp = togglemember(db, call)

            default:
                resp.Status = 1
        }
    }

    if resp.Status == 0 {
        resp.Contents, resp.Status = getcontents(db, resp.Head, resp.User.Inactive)
        resp.Hstr = getheader(db, resp.User.Cpos)

    } else {
        resp.Head = Item{}
    }

    resp.User.Pass = []byte("")
    enc.Encode(resp)
}

// Creates requested bucket if it doesn't already exist
func mkbucket(db *bolt.DB, cbuc []byte) error {
    e := db.Update(func(tx *bolt.Tx) error {
        tx.CreateBucketIfNotExists(cbuc)
        return nil
    })

    return e
}

// Deletes key from slice
func rmkeyfromstringslice(key string, slice []string) []string {

    ret := []string{}

    for _, v := range slice {
        if v != key { ret = append(ret, v) }
    }

    return ret
}

// Returns true if string exists in slice
func existsinstringslice(s string, sl []string) bool {

    for _, cs := range sl {
        if cs == s { return true }
    }

    return false
}

// Removes cid from contents of parents with id pid
func rmitemfromparent(db *bolt.DB, pid string, cid string) {

    p, status := getitem(db, pid)

    if status == 0 {
        p.Contents = rmkeyfromstringslice(cid, p.Contents)
        writem(db, p)
    }
}

// Permanently removes item and all children
func rmitem(db *bolt.DB, iid string) {

    i, status := getitem(db, iid)

    if status == 0 && len(i.Contents) > 0 {
        for _, cid := range i.Contents { rmitem(db, cid) }
        rmitemfromparent(db, i.Parent, i.ID)
        e := ddb(db, []byte(iid), IBUC)
        if e == nil { rmitemfrommaster(db, iid) }

    } else if status == 0 {
        e := ddb(db, []byte(iid), IBUC)
        if e == nil { rmitemfrommaster(db, iid) }
    }
}

// Periodically removes old items
func cleanup(db *bolt.DB) {

    for range time.Tick(CLEANCHECK) {
        olditems := []string{}
        i := getmasterindex(db)

        for _, i := range i.Item {
            ci, _ := getitem(db, i)
            if !ci.Active && time.Since(ci.ETime) > KEEPTIME {
                olditems = append(olditems, ci.ID)
            }
        }

        for _, oid := range olditems {
            rmitem(db, oid)
        }
    }
}

// Opens the database
func opendb(dbname string) *bolt.DB {

    db, e := bolt.Open(dbname, 0640, nil)
    cherr(e)

    return db
}

// Initialize server
func qlinit(db *bolt.DB) {

    mkbucket(db, IBUC)
    mkbucket(db, UBUC)
    mkbucket(db, GLOB)
}

func main() {

    db := opendb(DBNAME)
    defer db.Close()
    qlinit(db)

    go cleanup(db)

    // Static content
    http.Handle("/", http.FileServer(http.Dir("./static")))

    // Handler for user-related requests
    http.HandleFunc("/user", func(w http.ResponseWriter, r *http.Request) {
        h_user(w, r, db)
    })

    // Handler for item-related requests
    http.HandleFunc("/item", func(w http.ResponseWriter, r *http.Request) {
        h_item(w, r, db)
    })

    lport := fmt.Sprintf(":%d", PORT)
    e := http.ListenAndServe(lport, nil)
    cherr(e)
}
