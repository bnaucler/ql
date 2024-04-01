package main

import (
    "fmt"
    "log"
    "time"
    "net/http"
    "math/rand"
    "encoding/json"

    bolt "go.etcd.io/bbolt"
    bcrypt "golang.org/x/crypto/bcrypt"
)

const PORT = 9955
const DBNAME = "./data/ql.db"

const SKLEN = 30            // Skey length
const IDLEN = 15            // ID length
const SKNUM = 5             // Max number of concurrent skeys

const HOMENAME = "home"     // Name for root/head list

var GLOB = []byte("glob")   // Global settings
var IBUC = []byte("lbuc")   // Item bucket
var UBUC = []byte("ubuc")   // User bucket

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
    Head Item               // Current head / list
    Contents []Item         // List contents
    User User               // Current user
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

// Adds new user to database
func mkuser(db *bolt.DB, call Apicall) User {

    u := User{}

    // TODO input sanitization
    u.Uname = call.Uname
    u.Fname = call.Fname
    u.Lname = call.Lname
    u.Pass, _ = bcrypt.GenerateFromPassword([]byte(call.Pass), bcrypt.DefaultCost)

    i := mkheaditem(db, u)

    u.Root = i.ID
    u.Cpos = i.ID
    u.Inactive = false

    u = addskey(db, u) // Also commits user to db

    return u
}

// Adds new skey to slice, replacing the SKLEN:th oldest key
func addskey(db *bolt.DB, u User) User {

    u.Skey = append(u.Skey, randstr(SKLEN))

    if len(u.Skey) > SKNUM { u.Skey = u.Skey[1:] }

    wruser(db, u)

    return u
}

// Attempts user login
func loginuser(db *bolt.DB, call Apicall) (User, int) {

    u := getuser(db, call.Uname)
    status := 0

    e := bcrypt.CompareHashAndPassword(u.Pass, []byte(call.Pass))

    if e != nil {
        status = 1

    } else {
        u = addskey(db, u)
        u.Cpos = u.Root
    }

    u.Skey = u.Skey[len(u.Skey) - 1:]

    return u, status
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

    u := getuser(db, call.Uname)
    status := 0

    u.Cpos = call.ID; // TODO error control
    wruser(db, u)

    return u, status
}

// Toggles user inactive setting
func toggleinactive(db *bolt.DB, call Apicall) (User, int) {

    u := getuser(db, call.Uname)
    status := 0

    if(u.Inactive == false) {
        u.Inactive = true

    } else {
        u.Inactive = false
    }

    wruser(db, u)

    return u, status
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
            resp.User = getuser(db, call.Uname)

        case "new":
            resp.User = mkuser(db, call)

        case "login":
            resp.User, resp.Status = loginuser(db, call)

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
        resp.Head, resp.Status = getitem(db, resp.User.Cpos)
        resp.Contents, resp.Status = getcontents(db, resp.Head)
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

// Creates new item
func mkitem(db *bolt.DB, val string, parent string, tp string, u User) (Item, int) {

    i := Item{}
    p, status := getitem(db, parent)

    i.ID = randstr(IDLEN)
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

// Retrieves data objects from database based on parent
func getcontents(db *bolt.DB, head Item) ([]Item, int) {

    ret := []Item{}
    ci := Item{}
    status := 0

    for _, iid := range head.Contents {
        ci, status = getitem(db, iid)
        if status == 0 { ret = append(ret, ci) }
    }

    return ret, status
}

// Sets requested items status to inactive
func closeitem(db *bolt.DB, call Apicall) (Item, int) {

    i, status := getitem(db, call.ID)
    p, _ := getitem(db, call.Cpos)

    if status == 0 {
        i.Active = false
        i.ETime = time.Now()
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

// Handles item related requests
func h_item(w http.ResponseWriter, r *http.Request, db *bolt.DB) {

    call := getcall(r)
    enc := json.NewEncoder(w)

    fmt.Printf("DEBUG Item handler call: %+v\n\n", call)

    resp := Resp{}
    resp.User, resp.Status = valskey(db, call)
    resp.User.Skey = []string{}

    if(resp.Status == 0) {
        switch call.Action {
            case "get":
                resp.Head, resp.Status = getitem(db, call.ID)

            case "new":
                resp.Head, resp.Status = mkitemfromcall(db, call)

            case "close":
                resp.Head, resp.Status = closeitem(db, call)

            case "toggletype":
                resp.Head, resp.Status = toggletype(db, call)

            default:
                resp.Status = 1
        }
    }

    if resp.Status == 0 {
        resp.Contents, resp.Status = getcontents(db, resp.Head)

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
}

func main() {

    db := opendb(DBNAME)
    defer db.Close()
    qlinit(db)

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
