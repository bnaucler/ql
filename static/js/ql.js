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

    const uname = gls("qluname");
    const skey = gls("qlskey");
    const cpos = getcpos();
    const url = "/item?action=close&uname=" + uname + "&skey=" + skey +
                "&cpos=" + cpos + "&id=" + ID;

    refresh(await gofetch(url));
}

// Shows warning about removing non-empty list
function rmwarning(ID, clen) {

    const pdiv = gid("ui");
    const mdiv = mkobj("div", "contextmenu");
    const yesbtn = mkobj("button", "menubutton", "YES");
    const nobtn = mkobj("button", "menubutton", "NO");
    const cmheader = mkobj("div", "menuheader", "Remove non-empty list?");

    mdiv.appendChild(cmheader);
    mdiv.appendChild(yesbtn);
    mdiv.appendChild(nobtn);
    pdiv.appendChild(mdiv);

    yesbtn.onclick = () => { mdiv.remove(); rmitem(ID); }
    nobtn.onclick = () => mdiv.remove();
}

// Wrapper to check for empty list and show warning
function rmitemwrapper(ID, clen) {

    if(clen == 0) {
        rmitem(ID);

    } else {
        rmwarning(ID, clen);
    }
}

// Requests changing type (list/item) per object ID
async function toggletype(ID) {

    const uname = gls("qluname");
    const skey = gls("qlskey");
    const cpos = getcpos();
    const url = "/item?action=toggletype&uname=" + uname + "&skey=" + skey +
                "&cpos=" + cpos + "&id=" + ID;

    refresh(await gofetch(url));
}

// Opens up item context menu
function immenu(ID, itype, val) {

    const pdiv = gid("ui");
    const mdiv = mkobj("div", "contextmenu");
    const ctbtn = mkobj("button", "menubutton");
    const cmheader = mkobj("div", "menuheader", val);
    const cbtn = mkobj("button", "menubutton", "close");

    if(itype == "item") ctbtn.innerHTML = "make list";
    else ctbtn.innerHTML = "make item";

    mdiv.appendChild(cmheader);
    mdiv.appendChild(ctbtn);
    mdiv.appendChild(cbtn);
    pdiv.appendChild(mdiv);

    cbtn.onclick = () => mdiv.remove();
    ctbtn.onclick = () => { mdiv.remove(); toggletype(ID); }
}

// Requests list contents and sets cpos
async function enterlist(ID) {

    const uname = gls("qluname");
    const skey = gls("qlskey");
    const cpos = getcpos();
    const url = "/user?action=cspos&uname=" + uname + "&skey=" + skey +
                "&cpos=" + cpos + "&id=" + ID;

    refresh(await gofetch(url));
}

// Adds individual list item
function addlistitem(ID, val, itype, clen) {

    const pdiv = gid("ui");
    const idiv = mkobj("div", "item");
    const ival = mkobj("div", "itemval", val);
    const rmdiv = mkobj("div", "rm");
    const imdiv = mkobj("div", "itemmenubutton", "edit");

    if(itype == "list") {
        ival.innerHTML = val + " (" + clen + ")";
        ival.style.background = "var(--col-bglist)";
        ival.onclick = () => enterlist(ID);
        ival.style.cursor = "pointer";
    }

    idiv.appendChild(ival);
    idiv.appendChild(rmdiv);
    idiv.appendChild(imdiv);
    pdiv.appendChild(idiv);

    imdiv.onclick = () => immenu(ID, itype, val);
    rmdiv.onclick = () => rmitemwrapper(ID, clen);
}

// Populates list view
function poplist(obj) {

    gid("ui").innerHTML = "";

    const lilen = obj.Contents.length;

    for(let i = lilen - 1; i >= 0; i--) {
        let co = obj.Contents[i];
        let clen = 0;
        if(co.Contents !== null) clen = co.Contents.length; // TODO
        if(co.Active == true) addlistitem(co.ID, co.Value, co.Type, clen);
    }
}

// Sets correct text to 'show inactive'-button
function setinactivebtn(val) {

    console.log(val);

    const btn = gid("toggleinactivebtn");

    if(val == true) {
        btn.innerHTML = "all";

    } else if(val == false) {
        btn.innerHTML = "active";

    } else {
        btn.innerHTML = "active";
    }

    localStorage.qlinactive = val;
}

// Refreshes window
function refresh(obj) {

    localStorage.qlcpos = obj.User.Cpos;
    setinactivebtn(obj.User.Inactive);

    const loginscr = gid("login");
    if(obj.Head.Parent.length > 1) {
        gid("backbtn").onclick = () => enterlist(obj.Head.Parent)
    }

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

// Toggles showing inactive items
async function toggleinactive() {

    const uname = gls("qluname");
    const skey = gls("qlskey");
    const cpos = getcpos();
    const url = "/user?action=toggleinactive&uname=" + uname + "&skey=" + skey +
                "&cpos=" + cpos;

    refresh(await gofetch(url));
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
