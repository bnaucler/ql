var clist = "";

// Initialization of ql, called from index.html
function qlinit() {
    let req = "/getlists";
    mkxhr(req, procresp);

    document.getElementById('additem').onkeydown = function(e){
       if(e.keyCode == 13){ additem(); } // enter
    };
}

// Returns true if a list is open
function isinlist() {

    if(clist === undefined || clist == "") return false
    else return true
}

// Returns clist request string if applicable
function getclist() {

    if(isinlist()) return ""
    else return "&list=" + clist;
}

// Adds item to current list
function additem() {

    let i = document.getElementById("additem").value;
    var req = "/additem?name=" + i + getclist();
    mkxhr(req, procresp);

    console.log("Additem req: " + req);
    console.log("Adding item: " + i);
}

// Removes item
function rmitem(e) {

    console.log("Remove: " + e.parentNode.innerText);

    let req = "/rmitem?name=" + e.parentNode.innerText + getclist();
    mkxhr(req, procresp);
}

// Opens selected list
function openlist(e) {

    console.log("Open: " + e.innerText);

    let req = "/openlist?list=" + e.innerText;
    mkxhr(req, procresp);
}

// Returns to home screen
function reset() {
    clearui();
    clist = "";

    let url = "/getlists";
    mkxhr(url, procresp);
}

// Creates XHR and calls rfunc with response
function mkxhr(dest, rfunc) {
    var xhr = new XMLHttpRequest();

    xhr.open("POST", dest, true);
    xhr.setRequestHeader("Content-type", "application/x-www-form-urlencoded");

    xhr.onreadystatechange = function() {
        if(xhr.readyState == 4 && xhr.status == 200) {
            rfunc(xhr);
        }
    }

    xhr.send();
}

// Removes all listed items in UI
function clearui() {
    document.getElementById("ui").innerHTML = "";
}

// Adds item to UI
function adduiitem(id, name) {
    var ui = document.getElementById("ui");
    let item = document.createElement("div");
    let txt = document.createTextNode(name);
    let rm = document.createElement("div");

    item.classList.add("item");
    if(!isinlist()) item.onclick = function() { openlist(this); };

    rm.classList.add("rm");
    rm.onclick = function() { rmitem(this); };

    item.appendChild(txt);
    item.appendChild(rm);
    ui.appendChild(item);
}

// Processes lists request response
function procresp(resp) {

    var j = JSON.parse(resp.responseText);
    clearui();

    console.log("DEBUG procresp: " + j);

    if(j.Code == 1) clist = j.Name;

    for(l of j.Items) {
        adduiitem(0, l);
    }
}
