package main

import (
    "fmt"
    "log"
    "net/http"
    "encoding/json"

    "github.com/boltdb/bolt"
)

const PORT = 9955
const DBNAME = "./data/ql.db"

var INDEX = []byte(".index")
var LBUC = []byte(".lbuc")

type Apicall struct {
    Id string               // Id of item to process
    List string             // List name
    Name string             // Name of item to process
}

type Resp struct {
    Code int                // Status code
    Name string             // List name
    Items []string          // Item names
}

// Log all errors
func cherr(e error) error {
    if e != nil { log.Println(e) }
    return e
}

// Opens the database
func opendb(dbname string) *bolt.DB {

    db, e := bolt.Open(dbname, 0640, nil)
    cherr(e)

    return db
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
        return nil
    })
    return
}

// Processes API call
func getcall(r *http.Request) Apicall {

    e := r.ParseForm()
    cherr(e)

    ret := Apicall{
        Name:       r.FormValue("name"),
        List:       r.FormValue("list"),
        Id:         r.FormValue("id"),
    }

    return ret
}

// Reads list index from database
func getindex(db *bolt.DB, buc []byte) Resp {

    i := Resp{Code: 0}

    lraw, e := rdb(db, INDEX, buc)
    cherr(e)

    e = json.Unmarshal(lraw, &i)
    cherr(e)

    return i
}

// Handles incoming requests for list index
func getlists(w http.ResponseWriter, r *http.Request, db *bolt.DB) {

    resp := getindex(db, LBUC)

    enc := json.NewEncoder(w)
    enc.Encode(resp)
}

// Writes list index to database
func wrindex(db *bolt.DB, i Resp, buc []byte) {

    iraw, e := json.Marshal(i)
    cherr(e)

    e = wrdb(db, INDEX, iraw, buc)
    cherr(e)
}

// Adds list to index
func addtoindex(db *bolt.DB, name string, buc []byte) {

    iraw, e := rdb(db, INDEX, buc)
    cherr(e)

    i := Resp{}
    e = json.Unmarshal(iraw, &i)

    i.Items = append(i.Items, name)
    wrindex(db, i, buc)
}

// Returns correct bucket based on name
func getbuc(c Apicall) []byte {

    var buc []byte

    if len(c.List) < 1 {
        buc = LBUC
    } else {
        buc = []byte(c.List)
    }

    return buc
}

// Handles incoming requests to add lists
func additem(w http.ResponseWriter, r *http.Request, db *bolt.DB) {

    c := getcall(r)
    buc := getbuc(c)

    var name = []byte(c.Name)

    e := wrdb(db, name, name, buc)
    cherr(e)

    addtoindex(db, c.Name, buc)

    resp := getindex(db, buc)

    enc := json.NewEncoder(w)
    enc.Encode(resp)
}

// Removes a list from index
func rmitem(w http.ResponseWriter, r *http.Request, db *bolt.DB) {

    c := getcall(r)
    buc := getbuc(c)

    lindex := getindex(db, buc)
    nlindex := Resp{}

    for _, v := range lindex.Items {
        if v != c.Name {
            nlindex.Items = append(nlindex.Items, v)
        }
    }

    wrindex(db, nlindex, buc)

    enc := json.NewEncoder(w)
    enc.Encode(nlindex)
}

// Opens a list and returns contents
func openlist(w http.ResponseWriter, r *http.Request, db *bolt.DB) {

    c := getcall(r);

    resp := getindex(db, []byte(c.List))
    resp.Name = c.List
    resp.Code = 1

    enc := json.NewEncoder(w)
    enc.Encode(resp)
}

func main() {

    // Static content
    http.Handle("/", http.FileServer(http.Dir("./static")))

    db := opendb(DBNAME)
    defer db.Close()

    http.HandleFunc("/getlists", func(w http.ResponseWriter, r *http.Request) {
        getlists(w, r, db)
    })

    http.HandleFunc("/additem", func(w http.ResponseWriter, r *http.Request) {
        additem(w, r, db)
    })

    http.HandleFunc("/rmitem", func(w http.ResponseWriter, r *http.Request) {
        rmitem(w, r, db)
    })

    http.HandleFunc("/openlist", func(w http.ResponseWriter, r *http.Request) {
        openlist(w, r, db)
    })

    lport := fmt.Sprintf(":%d", PORT)
    e := http.ListenAndServe(lport, nil)
    cherr(e)
}
