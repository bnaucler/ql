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
    if(clist === undefined || clist == "") return false;
    else return true;
}

// Returns clist request string if applicable
function getclist() {
    if(!isinlist()) return "";
    else return "&list=" + clist;
}

// Processes input field and validates string
function readinput() {
    let s = document.getElementById("additem").value;
    document.getElementById("additem").value = "";

    if(s.includes('&')) return "INVALID";

    return s;
}

// Adds item to current list
function additem() {
    var req = "/additem?name=" + readinput() + getclist();
    mkxhr(req, procresp);
}

// Removes item
function rmitem(e) {
    let req = "/rmitem?name=" + e.parentNode.innerText + getclist();
    mkxhr(req, procresp);
}

// Opens selected list
function openlist(e) {
    let req = "/openlist?list=" + e.innerText;
    mkxhr(req, procresp);
}

// Returns to home screen
function reset() {
    clist = "";

    let req = "/getlists";
    mkxhr(req, procresp);
}

// Creates XHR and calls rfunc with response
function mkxhr(dest, rfunc) {
    var xhr = new XMLHttpRequest();

    console.log(dest);

    xhr.open("POST", dest, true);
    xhr.setRequestHeader("Content-type", "application/x-www-form-urlencoded");

    xhr.onreadystatechange = function() {
        if(xhr.readyState == 4 && xhr.status == 200) {
            rfunc(xhr);
        }
    }

    xhr.send();
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
    let hdr = document.getElementById("hdr");

    var j = JSON.parse(resp.responseText);

    console.log(j);

    if(j.Code == 1) {
        clist = j.Name;
        hdr.innerHTML = j.Name;

    } else {
        hdr.innerHTML = "home";
    }

    document.getElementById("ui").innerHTML = "";

    if(!j.Items) return;

    for(l of j.Items) {
        adduiitem(0, l);
    }
}
