// Alias to reduce typing
const gid = document.getElementById.bind(document);
const gls = localStorage.getItem.bind(localStorage);

// HTTP request wrapper
async function gofetch(url) {

    const resp = await fetch(url);

    if(resp.ok) return resp.json();
}

// Returns DOM object of requested type, and with class & text defined if requested
function mkobj(type, cl, txt) {

    let ret = document.createElement(type);

    if(cl !== undefined && cl != "") ret.classList.add(cl);

    if(txt !== undefined) {
        const tc = document.createTextNode(txt);
        ret.appendChild(tc);
    }

    return ret;
}

// Attempts user login
async function loginuser(form) {

    const uname = gid("unameinput").value;
    const pass = gid("passinput").value;
    const url = "/user?action=login&uname=" + uname + "&pass=" + pass;

    gid("loginform").reset();

    trylogin(await gofetch(url));
}

// Attempts creation of new user
async function mkuser(form) {

    const uname = gid("newunameinput").value;
    const pass = gid("newpassinput").value;
    const fname = gid("fnameinput").value;
    const lname = gid("lnameinput").value;
    const url = "/user?action=new&uname=" + uname + "&pass=" + pass +
                "&fname=" + fname + "&lname=" + lname;

    gid("newuserform").reset();

    trylogin(await gofetch(url));
}

// Removes stored user data and displays login screen
function logoutuser() {

    localStorage.qluname = "";
    localStorage.qlskey = "";
    gid("login").style.display = "block";
    gid("ui").innerHTML = "";
}

// Processes removal of item from list
async function rmitem(ID) {

    console.log(ID);

    const uname = gls("qluname");
    const skey = gls("qlskey");
    const cpos = getcpos();
    const url = "/item?action=close&uname=" + uname + "&skey=" + skey +
                "&cpos=" + cpos + "&id=" + ID;

    refresh(await gofetch(url));
}

// Adds individual list item
function addlistitem(ID, val) {

    const pdiv = gid("ui");
    const idiv = mkobj("div", "item", val);
    const rmdiv = mkobj("div", "rm");
    const imdiv = mkobj("div", "itemmenubutton", "edit");

    idiv.appendChild(rmdiv);
    idiv.appendChild(imdiv);
    pdiv.appendChild(idiv);

    rmdiv.onclick = () => rmitem(ID);
}

// Populates list view
function poplist(obj) {

    gid("ui").innerHTML = "";

    const lilen = obj.Contents.length;

    for(let i = lilen - 1; i >= 0; i--) {
        let co = obj.Contents[i];
        if(co.Active == true) addlistitem(co.ID, co.Value);
    }
}

// Refreshes window
function refresh(obj) {

    console.log(obj);

    localStorage.qlcpos = obj.User.Cpos;

    const loginscr = gid("login");

    if(obj.Status == 0) {
        loginscr.style.display = "none";
        gid("hdrtxt").innerHTML = obj.Head.Value;
        poplist(obj);

    } else {
        loginscr.style.display = "block";
    }
}

// Processes login response
function trylogin(obj) {

    console.log(obj);

    gid("newuser").style.display = "none";

    if(obj.Status == 0) {
        gid("login").style.display = "none";
        localStorage.qluname = obj.User.Uname;
        localStorage.qlskey = obj.User.Skey[0];
        localStorage.qlcpos = obj.User.Cpos;
        refresh(obj);

    } else {
        gid("login").style.display = "block";
    }
}

// Retrieves current position. Sets to root if unavailable
function getcpos() {

    let cpos = gls("qlcpos");

    if(cpos == undefined || cpos.Length < 1) logoutuser();
    else return cpos;
}

// Adds item to list
async function additem(elem) {

    const ival = elem.elements["itemval"].value;
    const uname = gls("qluname");
    const skey = gls("qlskey");
    const type = "item";
    const cpos = getcpos();
    const url = "/item?action=new&uname=" + uname + "&skey=" + skey +
                "&type=" + type + "&cpos=" + cpos + "&value=" + ival;

    gid("additemform").reset();

    refresh(await gofetch(url));
}

// Opens user registration window
function openmkuser() {

    gid("login").style.display = "none";
    gid("newuser").style.display = "block";
}

// Initialize frontend
async function qlinit() {

    const uname = gls("qluname");
    const skey = gls("qlskey");
    const url = "/user?action=valskey&uname=" + uname + "&skey=" + skey;

    refresh(await gofetch(url));
}

// Init sequence after window refresh
window.onbeforeunload = () => {
    qlinit();
};

// Init sequence on load
window.onload = () => {
    qlinit();
};
