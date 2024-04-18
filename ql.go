package main

import (
    "fmt"
    "log"
    "net"
    "time"
    "flag"
    "slices"
    "regexp"
    "strings"
    "net/url"
    "net/http"
    "math/rand"
    "encoding/json"

    bolt "go.etcd.io/bbolt"
    bcrypt "golang.org/x/crypto/bcrypt"
)

const DEF_PORT = 9955               // Default port to listen
const DEF_DBNAME = "./data/ql.db"   // Default database filename

const CLEANCHECK = 1 * time.Hour    // Time interval to check for inactive items
const KEEPTIME = 120 * time.Hour    // How long to keep item after closing

const MINPASSLEN = 4        // Minimum password length

const SKLEN = 30            // Session key length
const IDLEN = 15            // ID length
const SKNUM = 5             // Max number of concurrent session keys

const HOMENAME = "home"     // Name for root/head list

var GLOB = []byte("glob")   // Global settings
var IBUC = []byte("lbuc")   // Item bucket TODO
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
    Hids []string           // Header link IDs
    Hvals []string          // Header link values
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
    Href string             // Item link
    CTime time.Time         // Time of creation
    ETime time.Time         // End time (item closed)
}

// Create random string of length ln
func randstr(ln int) (string) {

    const charset = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ"
    cslen := len(charset)

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

// Returns origin IP address from HTTP request
func getreqip(r *http.Request) net.IP {

    ip := r.Header.Get("x-real-ip")
    if ip == "" { ip = r.Header.Get("x-forwarded-for") }
    if ip == "" { ip = r.RemoteAddr }

    return net.ParseIP(ip)
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

    if e == nil { e = wrdb(db, []byte(GLOB), bti, GLOB) }
    if e != nil { log.Printf("ERROR Could not write master index to db") }
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

// Removes user from master index
func rmuserfrommaster(db *bolt.DB, uid string) {

    i := getmasterindex(db)
    nu := []string{}

    for _, id := range i.User {
        if id != uid { nu = append(nu, id) }
    }

    i.User = nu
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

    if e != nil {
        log.Printf("ERROR Could not parse request form (source %s)\n", getreqip(r))
        return Apicall{}
    }

    return Apicall{
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
}

// Stores user object in database
func wruser(db *bolt.DB, u User) {

    btu, e := json.Marshal(u)
    if e == nil { e = wrdb(db, []byte(u.Uname), btu, UBUC) }
    if e != nil { log.Printf("ERROR Could not write user %s\n", u.Uname) }
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

// Returns true if string is alphanumeric
func isalphanum(s string) bool {

    return regexp.MustCompile(`^[a-zA-Z0-9]*$`).MatchString(s)
}

// Adds new user to database
func mkuser(db *bolt.DB, call Apicall, r *http.Request) (User, int, string) {

    u := User{}
    status := 0
    err := ""

    uname := strings.ToLower(strings.TrimSpace(call.Uname))

    if userexists(db, uname) {
        status = 1
        err = "Username not available"

    } else if len(call.Uname) < 1 || len(call.Fname) < 1 || len(call.Lname) < 1 {
        status = 1
        err = "No input fields can be left empty"

    } else if len(call.Pass) < MINPASSLEN {
        status = 1
        err = fmt.Sprintf("Password needs to be at least %d characters long", MINPASSLEN)

    } else if !isalphanum(call.Uname) {
        status = 1
        err = "Only a-z, A-Z and 0-9 allowed in usernames"
    }

    if status == 0 {
        u.Uname = uname
        u.Fname = call.Fname
        u.Lname = call.Lname
        u.Inactive = false

        u.Pass, _ = bcrypt.GenerateFromPassword([]byte(call.Pass), bcrypt.DefaultCost)
        i := mkheaditem(db, u)

        u.Root = i.ID
        u.Cpos = i.ID

        u = addskey(db, u) // Also commits user to db
        usertomaster(db, u.Uname)

        log.Printf("New user %s created (source %+v)\n", u.Uname, getreqip(r))
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
func loginuser(db *bolt.DB, call Apicall, r *http.Request) (User, int, string) {

    uname := strings.ToLower(strings.TrimSpace(call.Uname))
    u := getuser(db, uname)
    status := 0
    err := ""

    e := bcrypt.CompareHashAndPassword(u.Pass, []byte(call.Pass))

    if e != nil {
        status = 1
        err = "Incorrect username / password"
        log.Printf("Failed login for user %s (source %+v)\n",
            uname, getreqip(r))

    } else {
        u = addskey(db, u)
        u.Skey = u.Skey[len(u.Skey) - 1:]
        u.Cpos = u.Root
    }

    return u, status, err
}

// Processes edit of user details
func edituser(db *bolt.DB, call Apicall, r *http.Request) (User, int, string) {

    u, status := valskey(db, call)
    err := ""

    if status == 0 {
        if len(call.Fname) < 1 || len(call.Lname) < 1 {
            err = "Name fields cannot be left blank"

        } else {
            u.Fname = call.Fname
            u.Lname = call.Lname
            wruser(db, u)
            log.Printf("User %s set new name to %s %s\n", u.Uname, u.Fname, u.Lname)
            err = fmt.Sprintf("Name changed to %s %s", u.Fname, u.Lname)
        }

    } else {
        status = 1
        err = "User verification failed"
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

    if status != 0 && call.Uname != "" { // "": special case when no localstorage
        log.Printf("Session key verification error for user %s\n", call.Uname)
    }

    return u, status
}

// Changes user cpos to call request
func cspos(db *bolt.DB, call Apicall) (User, int) {

    u, status := valskey(db, call)
    np := Item{}

    if status == 0 {
        np, status = getitem(db, call.ID)
        if np.Owner == u.Uname || existsinstringslice(u.Uname, np.Members) {
            u.Cpos = np.ID

        } else {
            u.Cpos = u.Root
        }

        wruser(db, u)

    } else {
        status = 1
    }

    return u, status
}

// Toggles user inactive setting
func toggleinactive(db *bolt.DB, call Apicall) (User, int) {

    u, status := valskey(db, call)

    if status == 0 {
        u.Inactive = !u.Inactive
        wruser(db, u)
    }

    return u, status
}

// Splits user slice in members and non-members
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

// Returns a slice of users based on API request
func getuserspersearch(db *bolt.DB, call Apicall) []User {

    mi := getmasterindex(db)
    list := []User{}
    lcv := strings.ToLower(call.Value)

    for _, uid := range mi.User {
        tu := getuser(db, uid)
        if strings.Contains(strings.ToLower(tu.Uname), lcv) ||
           strings.Contains(strings.ToLower(tu.Fname), lcv) ||
           strings.Contains(strings.ToLower(tu.Lname), lcv) {
                list = append(list, tu)
        }
    }

    return list
}

// Removes duplicate users from slice
func rmduplicateusers(sl []User) []User {

    ret := []User{}

    for _, u := range sl {
        isin := false

        for _, ur := range ret {
            if ur.Uname == u.Uname { isin = true }
        }

        if !isin { ret = append(ret, u) }
    }

    return ret
}

// Returns user list based on search request TODO refactor
func getuserlist(db *bolt.DB, call Apicall) Resp {

    resp := Resp{}
    tmplist := []User{}
    tu := User{}
    i := Item{}

    resp.User, resp.Status = valskey(db, call)
    if resp.Status != 0 {
        resp.Err = "Key verification failed"
    }

    i, resp.Status = getitem(db, call.ID)
    if resp.Status != 0 {
        resp.Err = "Could not open requested item"
    }

    if resp.Status == 0 {
        // Append owner
        tmplist = append(tmplist, getuser(db, i.Owner))

        // Append users based on item members
        for _, imuid := range i.Members {
            tu = getuser(db, imuid)
            tmplist = append(tmplist, tu)
        }

        // Append users based on search request
        if call.Value != "" {
            tmplist = append(tmplist, getuserspersearch(db, call)...)
        }

        // Remove duplicates
        tmplist = rmduplicateusers(tmplist)

        // Remove sensitive / unnecessary data from list
        for _, tu = range tmplist {
            tu.Skey = []string{}
            tu.Pass = []byte{}
            tu.Cpos = ""
            tu.Root = ""
        }

        resp.Ulist, resp.Umembers = splituserlist(db, call.ID, tmplist)
        resp.Ref = call.ID
    }

    return resp
}

// Processes removal of user account
func rmuser(db *bolt.DB, call Apicall) (User, int, string) {

    u, status := valskey(db, call)
    err := ""

    if status == 0 {
        rmitem(db, u.Root)
        rmuserfrommaster(db, u.Uname)
        e := ddb(db, []byte(u.Uname), UBUC)

        if e == nil {
            err = "User sucessfully removed"
            log.Printf("User %s removed from database", call.Uname)
            status = 1
        }

    } else {
        err = "Key verification failed"
    }

    return u, status, err
}

// Processes password change request
func chpass(db *bolt.DB, call Apicall, r *http.Request) (User, int, string) {

    u, status := valskey(db, call)
    err := ""

    e := bcrypt.CompareHashAndPassword(u.Pass, []byte(call.Pass))

    if status == 0 && e == nil {

        if len(call.Value) < MINPASSLEN {
            err = fmt.Sprintf("Password needs to be at least %d characters long",
                              MINPASSLEN)

        } else {
            err = "Password successfully updated"
            u.Pass, _ = bcrypt.GenerateFromPassword([]byte(call.Value),
                        bcrypt.DefaultCost)
            wruser(db, u)
        }

    } else {
        log.Printf("Password change request for %s failed (source %+v)",
                   call.Uname, getreqip(r))
        err = "User verification failed"
    }

    return u, status, err
}

// Handles user related requests
func h_user(w http.ResponseWriter, r *http.Request, db *bolt.DB) {

    call := getcall(r)
    enc := json.NewEncoder(w)

    resp := Resp{}
    resp.Status = 0

    switch call.Action {
        case "get":
            resp = getuserlist(db, call)

        case "new":
            resp.User, resp.Status, resp.Err = mkuser(db, call, r)

        case "edit":
            resp.User, resp.Status, resp.Err = edituser(db, call, r)

        case "login":
            resp.User, resp.Status, resp.Err = loginuser(db, call, r)

        case "chpass":
            resp.User, resp.Status, resp.Err = chpass(db, call, r)

        case "valskey":
            resp.User, resp.Status = valskey(db, call)

        case "cspos":
            resp.User, resp.Status = cspos(db, call)

        case "toggleinactive":
            resp.User, resp.Status = toggleinactive(db, call)

        case "rm":
            resp.User, resp.Status, resp.Err = rmuser(db, call)

        default:
            resp.Status = 1
            resp.Err = "Illegal request"
    }

    if call.Action != "login" && call.Action != "new" {
        resp.User.Skey = []string{}
    }

    if resp.Status != 0 {
        resp.Head = Item{}

    } else {
        if !itemexists(db, resp.User.Cpos) { resp.User.Cpos = resp.User.Root }
        resp.Head, resp.Status = getitem(db, resp.User.Cpos)
        resp.Contents, resp.Status = getcontents(db, resp.Head,
                                     resp.User.Uname, resp.User.Inactive)
        resp.Hids, resp.Hvals = getheader(db, resp.User.Uname, resp.User.Cpos)
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

    bti, e := json.Marshal(i)
    if e == nil { e = wrdb(db, []byte(i.ID), bti, IBUC) }
    if e != nil { log.Printf("ERROR Could not store object %s\n", i.ID) }
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

// Returns true if iid is a root level item
func isroot(db *bolt.DB, iid string) bool {

    i, status := getitem(db, iid)
    if status == 0 && i.Parent == "" && i.Value == HOMENAME {
        return true
    }

    return false
}

// Assigns membership based on parent
func propmembers(db *bolt.DB, i Item) []string {

    p, status := getitem(db, i.Parent)
    ret := []string{}

    if status == 0 {
        if p.Owner != i.Owner { ret = append(ret, p.Owner) }
        for _, uid := range p.Members {
            if uid != i.Owner { ret = append(ret, uid) }
        }
    }

    return ret
}

// Creates new item
func mkitem(db *bolt.DB, call Apicall) (Item, int, string) {

    i := Item{}
    p, status := getitem(db, call.Cpos)
    u := getuser(db, call.Uname)
    call.Value = strings.TrimSpace(call.Value)
    err := ""

    if status == 0 {
        i.ID = mkitemid(db)

        if len(call.Value) > 0 {
            i.Value = call.Value
            i.Parent = p.ID
            i.Owner = u.Uname
            i.CTime = time.Now()
            i.Active = true

            if !isroot(db, i.Parent) { i.Members = propmembers(db, i) }

        } else {
            err = "Cannot add items without name"
        }

        if call.Type == "item" || call.Type == "list" {
            i.Type = call.Type

        } else {
            status = 1
        }

        if status == 0 && err == "" {
            itemtomaster(db, i.ID)
            writem(db, i)
            p = setitemchild(db, i)
        }

    } else {
        err = "Could not open parent item"
    }

    return p, status, err
}

// Returns true if item is active
func checkactive(db *bolt.DB, iid string) bool {

    i, status := getitem(db, iid)

    if i.Active && status == 0 { return true }

    return false
}

// Removes inactive items from slice TODO return string instead of item
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

// Returns true if uid is owner or member of item
func ismember(db *bolt.DB, iid string, uid string) bool {

    i, status := getitem(db, iid)

    if status == 0 {
        if i.Owner == uid { return true }
        for _, iuid := range i.Members {
            if iuid == uid { return true }
        }
    }

    return false
}

// Returns header value & ID slices based on cpos
func getheader(db *bolt.DB, uid string, cpos string) ([]string, []string) {

    ids := []string{}
    vals := []string{}
    i := Item{}
    status := 0

    for status == 0 {
        i, status = getitem(db, cpos)

        if status == 0 && ismember(db, cpos, uid) {
            ids = append(ids, i.ID)
            vals = append(vals, i.Value)
            cpos = i.Parent

        } else if status == 0 {
            u := getuser(db, uid)
            i, status = getitem(db, u.Root)
            if status == 0 {
                ids = append(ids, i.ID)
                vals = append(vals, i.Value)
            }
            status = 1
        }
    }

    slices.Reverse(ids);
    slices.Reverse(vals);

    return ids, vals
}

// Retrieves data objects from database based on parent
func getcontents(db *bolt.DB, head Item, uid string, inactive bool) ([]Item, int) {

    ret := []Item{}
    ci := Item{}
    status := 0

    for _, iid := range head.Contents {
        ci, status = getitem(db, iid)

        if status == 0 && ismember(db, iid, uid){
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

// Adds existing item to root level of user (or parent if member)
func addtoroot(db *bolt.DB, iid string, uid string) bool {

    root := Item{}
    status := 0

    i, status := getitem(db, iid)

    if ismember(db, i.Parent, uid) {
        root, status = getitem(db, i.Parent)

    } else {
        u := getuser(db, uid)
        root, status = getitem(db, u.Root)
    }

    if status == 0 && !existsinstringslice(iid, root.Contents) {
        root.Contents = append(root.Contents, iid)
        writem(db, root)
        return true
    }

    return false
}

// Unlinks shared item from member root
func rmfromroot(db *bolt.DB, iid string, uid string) bool {

    u := getuser(db, uid)
    root, status := getitem(db, u.Root)

    if status == 0 && existsinstringslice(iid, root.Contents) {
        root.Contents = rmkeyfromstringslice(iid, root.Contents)
        writem(db, root)
        return true
    }

    return false
}

// Adds member to item and all sub-items
func addmember(db *bolt.DB, iid string, uid string) {

    i, status := getitem(db, iid)

    if status == 0 {
        if !existsinstringslice(uid, i.Members) {
            i.Members = append(i.Members, uid)
        }

        if len(i.Contents) > 0 {
            for _, cid := range i.Contents {
                addmember(db, cid, uid)
            }
        }
        writem(db, i)
    }
}

// Removes membership for uid from iid and all sub-items
func rmmember(db *bolt.DB, iid string, uid string) {

    i, status := getitem(db, iid)

    if status == 0 {
        i.Members = rmkeyfromstringslice(uid, i.Members)

        if len(i.Contents) > 0 {
            for _, cid := range i.Contents {
                rmmember(db, cid, uid)
            }
        }
        writem(db, i)
    }
}

// Toggles item membership
func togglemember(db *bolt.DB, call Apicall) Resp {

    resp := Resp{}
    i, status := getitem(db, call.ID)
    resp.Status = status
    ux := userexists(db, call.Value)

    if resp.Status == 0 && ux == true {
        resp.User, status = valskey(db, call)

        if call.Value == i.Owner {
            resp.Status = 1
            resp.Err = "Cannot remove item owner from member list"

        } else if existsinstringslice(call.Value, i.Members) {
            rmmember(db, call.ID, call.Value)
            rmfromroot(db, call.ID, call.Value)

        } else if i.Owner == call.Uname {
            addmember(db, call.ID, call.Value)
            addtoroot(db, call.ID, call.Value)

        } else {
            resp.Err = "Only list owner can share"
        }

        mi := getmasterindex(db)
        tmplist := []User{}

        for _, uid := range mi.User {
            tu := getuser(db, uid)
            tu.Pass = []byte("")
            tu.Skey = []string{}
            tmplist = append(tmplist, tu)
        }

        resp.Head, status = getitem(db, call.Cpos)
        _, resp.Umembers = splituserlist(db, call.ID, tmplist)
        resp.Ref = call.ID

    } else {
        resp.Err = "Could not open requested object"
    }

    return resp
}

// Permanently deletes item from database
func permdel(db *bolt.DB, call Apicall) (Item, string) {

    _, status := getitem(db, call.Cpos)
    err := ""

    if status == 0 {
        i, status := getitem(db, call.ID)
        if status == 0 && i.Owner == call.Uname {
            rmitem(db, call.ID)

        } else {
            err = "Cannot remove item you don't own"
        }
    }

    head, _ := getitem(db, call.Cpos)
    return head, err
}

// Requests edit of item href value
func sethref(db *bolt.DB, call Apicall) (Item, int, string) {

    i := Item{}
    p, status := getitem(db, call.Cpos)
    call.Value = strings.TrimSpace(call.Value)
    err := ""

    _, e := url.ParseRequestURI(call.Value)

    if e != nil && call.Value != ""  {
        call.Value = fmt.Sprintf("http://%s", call.Value)
    }

    if status == 0 {
        i, status = getitem(db, call.ID)
        if status == 0 {
            _, e := url.ParseRequestURI(call.Value)
            if e == nil || call.Value == "" {
                i.Href = call.Value
                writem(db, i)

            } else {
                err = "Please enter a valid URL"
            }
        }
    }

    return p, status, err
}

// Processes item value change
func chval(db *bolt.DB, call Apicall, r *http.Request) (Item, int, string) {

    i, status := getitem(db, call.ID)
    err := ""

    if status == 0 && len(call.Value) > 0 {
        i.Value = call.Value
        writem(db, i)

    } else {
        err = "Could not process item value change"
    }

    pos, _ := getitem(db, call.Cpos)

    return pos, status, err
}

// Handles item related requests
func h_item(w http.ResponseWriter, r *http.Request, db *bolt.DB) {

    call := getcall(r)
    enc := json.NewEncoder(w)

    resp := Resp{}
    resp.User, resp.Status = valskey(db, call)
    resp.User.Skey = []string{}

    if resp.Status == 0 {
        switch call.Action {
            case "get":
                resp.Head, resp.Status = getitem(db, call.ID)

            case "new":
                resp.Head, resp.Status, resp.Err = mkitem(db, call)

            case "open":
                resp.Head, resp.Status = toggleactive(db, call)

            case "close":
                resp.Head, resp.Status = toggleactive(db, call)

            case "permdel":
                resp.Head, resp.Err = permdel(db, call)

            case "chval":
                resp.Head, resp.Status, resp.Err = chval(db, call, r)

            case "toggletype":
                resp.Head, resp.Status = toggletype(db, call)

            case "togglemember":
                resp = togglemember(db, call)

            case "href":
                resp.Head, resp.Status, resp.Err = sethref(db, call)

            default:
                resp.Status = 1
                resp.Err = "Illegal request"
        }
    }

    if resp.Status == 0 {
        if !itemexists(db, resp.User.Cpos) { resp.User.Cpos = resp.User.Root }
        resp.Contents, resp.Status = getcontents(db,
                                     resp.Head,resp.User.Uname, resp.User.Inactive)
        resp.Hids, resp.Hvals = getheader(db, resp.User.Uname, resp.User.Cpos)

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
        for _, cid := range i.Contents {
            ci, _ := getitem(db, cid)
            if ci.Owner == i.Owner { rmitem(db, cid) }
        }
    }

    if status == 0 {
        for _, mid := range i.Members { rmfromroot(db, i.ID, mid) }
        rmitemfromparent(db, i.Parent, i.ID)
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

        oilen := len(olditems)
        for _, oid := range olditems { rmitem(db, oid) }

        if oilen > 0 {
            log.Printf("Periodical cleanup removed %d items\n", oilen)
        }
    }
}

// Opens the database
func opendb(dbname string) *bolt.DB {

    db, e := bolt.Open(dbname, 0640, &bolt.Options{Timeout: 1 * time.Second})
    if e != nil { log.Fatal("Could not open obtain database lock: exiting") }

    return db
}

// Initialize server
func qlinit(db *bolt.DB) {

    mkbucket(db, IBUC)
    mkbucket(db, UBUC)
    mkbucket(db, GLOB)
}

func main() {

    pptr := flag.Int("p", DEF_PORT, "port number to listen")
    dbptr := flag.String("d", DEF_DBNAME, "specify database to open")
    flag.Parse()

    rand.Seed(time.Now().UnixNano())

    db := opendb(*dbptr)
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

    lport := fmt.Sprintf(":%d", *pptr)
    e := http.ListenAndServe(lport, nil)
    if e != nil { log.Fatal("Could not open port: exiting") }
}
