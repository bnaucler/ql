// Alias to reduce typing
const gid = document.getElementById.bind(document);
const gls = localStorage.getItem.bind(localStorage);

let qlautoref;

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

// Shows a temporary status message on the screen
function statuspopup(msg) {

    const mdiv = mkobj("div", "statuspop", msg);
    const pdiv = gid("spopcontainer");

    setTimeout(() => { mdiv.remove(); }, 4000);
    setTimeout(() => { mdiv.classList.add("fade-out"); }, 3000);

    mdiv.addEventListener("click", () => mdiv.remove());

    pdiv.appendChild(mdiv);
}

// Attempts user login
async function loginuser(form) {

    const uname = encodeURIComponent(gid("unameinput").value);
    const pass = encodeURIComponent(gid("passinput").value);
    const url = "/user?action=login&uname=" + uname + "&pass=" + pass;

    gid("loginform").reset();

    trylogin(await gofetch(url));
}

// Attempts creation of new user
async function mkuser(form) {

    const uname = encodeURIComponent(gid("newunameinput").value);
    const pass = encodeURIComponent(gid("newpassinput").value);
    const fname = encodeURIComponent(gid("fnameinput").value);
    const lname = encodeURIComponent(gid("lnameinput").value);
    const url = "/user?action=new&uname=" + uname + "&pass=" + pass +
                "&fname=" + fname + "&lname=" + lname;

    gid("newuserform").reset();

    trylogin(await gofetch(url));
}

// Requests change of user details
async function chuser(form) {

    const uname = gls("qluname");
    const skey = gls("qlskey");
    const cpos = getcpos();
    const fname = encodeURIComponent(gid("chfname").value);
    const lname = encodeURIComponent(gid("chlname").value);
    const url = "/user?action=edit&uname=" + uname + "&skey=" + skey +
                "&fname=" + fname + "&lname=" + lname;

    refresh(await gofetch(url));
}

// Removes stored user data and displays login screen
function logoutuser() {

    localStorage.qluname = "";
    localStorage.qlskey = "";
    gid("login").style.display = "block";
    gid("usermenu").style.display = "none";
    gid("ui").innerHTML = "";
}

// Processes removal of item from list
async function edititem(ID, rem) {

    const uname = gls("qluname");
    const skey = gls("qlskey");
    const cpos = getcpos();
    const url = "/item?action=" + rem + "&uname=" + uname + "&skey=" + skey +
                "&cpos=" + cpos + "&id=" + ID;

    refresh(await gofetch(url));
}

// Shows removal warning window
function warning(ID, clen, wtxt, action) {

    const pdiv = gid("ui");
    const mdiv = mkobj("div", "contextmenu");
    const yesbtn = mkobj("button", "menubutton", "Do it");
    const nobtn = mkobj("button", "menubutton", "Cancel");
    const cmheader = mkobj("div", "menuheader", wtxt);

    mdiv.appendChild(cmheader);
    mdiv.appendChild(yesbtn);
    mdiv.appendChild(nobtn);
    pdiv.appendChild(mdiv);

    yesbtn.onclick = () => { mdiv.remove(); edititem(ID, action); }
    nobtn.onclick = () => mdiv.remove();
}

// Wrapper to check for empty list and show warning
function rmitemwrapper(ID, clen) {

    if(clen == 0) edititem(ID, "close");
    else warning(ID, clen, "Remove non-empty list?", "close");
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

// Wrapper to check for contents and generate warning when making to item
function toggletypewrapper(ID, itype, clen) {

    if(clen != 0 && itype == "list")
        warning(ID, clen, "List has contents. Proceed?", "toggletype");
    else toggletype(ID);
}

// Requests toggle of item membership
async function toggleitemmember(val, ID, ulist) {

    const uname = gls("qluname");
    const skey = gls("qlskey");
    const cpos = getcpos();
    const url = "/item?action=togglemember&uname=" + uname + "&skey=" + skey +
                "&cpos=" + cpos + "&id=" + val + "&value=" + ID;

    ulist.innerHTML = "";
    popshareusers(await gofetch(url), ulist);
}

// Adds a non-member entry to share list
function addshareuser(u, oid, ismember, ulist) {

    const nstr = u.Fname + " " + u.Lname + " (@" + u.Uname + ")";
    const undiv = mkobj("div", "slname", nstr);

    if(!ismember) undiv.style.color = "var(--col-rm)";

    undiv.onclick = () => toggleitemmember(oid, u.Uname, ulist);

    return undiv
}

// Populates user list for sharing items
function popshareusers(obj, ulist) {

    if(obj.Status != 0 || obj.Err == undefined || obj.Err != "")
        statuspopup(obj.Err);
    else poplist(obj);

    if(obj.Umembers != undefined) {
        for(const u of obj.Umembers)
            ulist.appendChild(addshareuser(u, obj.Ref, true, ulist));
    }

    if(obj.Ulist != undefined) {
        for(const u of obj.Ulist)
            ulist.appendChild(addshareuser(u, obj.Ref, false, ulist));
    }
}

// Requests items to populate share menu
async function getshareusers(ID, usearch, ulist) {

    const val = encodeURIComponent(usearch.value);
    const uname = gls("qluname");
    const skey = gls("qlskey");
    const cpos = getcpos();
    const url = "/user?action=get&uname=" + uname + "&skey=" + skey +
                "&cpos=" + cpos + "&id=" + ID + "&value=" + val;

    ulist.innerHTML = "";
    popshareusers(await gofetch(url), ulist);
}

// Opens up the item share menu
function sharemenu(ID, val) {

    const pdiv = gid("body");
    const mdiv = mkobj("div", "contextmenu");
    const cmheader = mkobj("div", "menuheader", val);
    const usearch = mkobj("input", "");
    const ulist = mkobj("div", "ulist");
    const searchbtn = mkobj("button", "menubutton", "search");
    const cbtn = mkobj("div", "closebutton", "X");

    usearch.setAttribute("type", "text");
    usearch.placeholder = "user search";
    usearch.id = "usearchinput";

    mdiv.appendChild(cmheader);
    mdiv.appendChild(usearch);
    mdiv.appendChild(ulist);
    mdiv.appendChild(searchbtn);
    mdiv.appendChild(cbtn);
    pdiv.appendChild(mdiv);

    cbtn.onclick = () => mdiv.remove();
    searchbtn.onclick = () => { getshareusers(ID, usearch, ulist); }
}

// Permanently deletes item from database
async function permdel(ID) {

    const uname = gls("qluname");
    const skey = gls("qlskey");
    const cpos = getcpos();
    const url = "/item?action=permdel&uname=" + uname + "&skey=" + skey +
                "&cpos=" + cpos + "&id=" + ID;

    refresh(await gofetch(url));
}

// Opens up item context menu
function immenu(ID, itype, clen, val, active) {

    const pdiv = gid("body");
    const mdiv = mkobj("div", "contextmenu");
    const cmheader = mkobj("div", "menuheader", val);
    const ctbtn = mkobj("button", "menubutton");
    const cbtn = mkobj("div", "closebutton", "X");

    mdiv.appendChild(cmheader);

    if(!active) {
        const restorebtn = mkobj("button", "menubutton", "restore");
        const pdelbtn = mkobj("button", "menubutton", "delete forever");
        pdelbtn.style.background = "var(--col-rm)";
        pdelbtn.style.color = "var(--col-txt)";
        mdiv.appendChild(restorebtn);
        mdiv.appendChild(pdelbtn);
        restorebtn.onclick = () => { mdiv.remove(); edititem(ID, "open"); }
        pdelbtn.onclick = () => { mdiv.remove(); permdel(ID); }

    } else if(itype == "item") {
        ctbtn.innerHTML = "make list";
        mdiv.appendChild(ctbtn);

    } else {
        const sharebtn = mkobj("button", "menubutton", "share");
        ctbtn.innerHTML = "make item";
        mdiv.appendChild(sharebtn);
        mdiv.appendChild(ctbtn);
        sharebtn.onclick = () => { mdiv.remove(); sharemenu(ID, val); }
    }

    mdiv.appendChild(cbtn);
    pdiv.appendChild(mdiv);

    cbtn.onclick = () => mdiv.remove();
    ctbtn.onclick = () => { mdiv.remove(); toggletypewrapper(ID, itype, clen); }
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
function addlistitem(ID, val, itype, active, clen) {

    const pdiv = gid("ui");
    const idiv = mkobj("div", "item");
    const ival = mkobj("div", "itemval", val);
    const rmdiv = mkobj("div", "rm");
    const imdiv = mkobj("div", "itemmenubutton", "edit");

    if(itype == "list") {
        ival.innerHTML = val + " (" + clen + ")";
        ival.style.fontWeight = "700";
        ival.onclick = () => enterlist(ID);
        ival.style.cursor = "pointer";
    }

    if(active) {
        rmdiv.onclick = () => rmitemwrapper(ID, clen);

    } else {
        ival.style.background = "var(--col-bginact)";
        rmdiv.style.background = "var(--col-bginact)";
        rmdiv.innerHTML = "+";
        rmdiv.onclick = () => edititem(ID, "open");
    }

    idiv.appendChild(ival);
    idiv.appendChild(rmdiv);
    idiv.appendChild(imdiv);
    pdiv.appendChild(idiv);

    imdiv.onclick = () => immenu(ID, itype, clen, val, active);
}

// Wrapper for processing lists or items separately
function addlistitemwrapper(co) {

    let clen = 0;
    if(co.Contents != null && co.Contents != undefined)
        clen = co.Contents.length;
    addlistitem(co.ID, co.Value, co.Type, co.Active, clen);
}

// Sorts items alphabetically
function alphasort(arr) {

    return arr.sort((a, b) => a.Value.localeCompare(b.Value));
}

// Loops through list according to selected sorting method
function picksortmethod(obj) {

    const lilen = obj.length;
    const method = getsortmethod();

    if(method == "chrona") {
        for(let i = lilen - 1; i >= 0; i--) addlistitemwrapper(obj[i])

    } else if(method == "chrond") {
        for(const co of obj) addlistitemwrapper(co);

    } else {
        obj = alphasort(obj);
        for(const co of obj) addlistitemwrapper(co);
    }
}

// Populates list view
function poplist(obj) {

    gid("ui").innerHTML = "";

    let lists = [];
    let items = [];

    for(const li of obj.Contents) {
        if(li.Type == "list") lists.push(li);
        else items.push(li);
    }

    picksortmethod(lists);
    picksortmethod(items);

}

// Retrieves sorting method from localstorage or sets if nonexistant
function getsortmethod() {

    let method = gls("qlsort");

    if(method == null || method == undefined) {
        method = "chrona";
        localStorage.qlsort = method;
    }

    gid("sortorder").value = method;

    return method;
}

// Reads sorting order settings and calls update
function sortlist(obj) {

    localStorage.qlsort = obj.value;
    qlinit();
}

// Flips 'show inactive' switch to correct position
function setinactivebtn(val) {

    const sw = gid("toggleinactiveval");

    if(val == true) {
        sw.style.left = "20px";

    } else {
        sw.style.left = "0";
    }

    localStorage.qlinactive = val;
}

// Updates user menu
function uminit(u) {

    const initials = u.Fname[0] + u.Lname[0];
    const umbtn = gid("usermenubtn");
    const umhdr = gid("userheader");

    umbtn.innerHTML = initials.toUpperCase();
    umhdr.innerHTML = u.Fname + " " + u.Lname;
}

// Updates values for name changing textboxes
function setchnamevals(u) {

    gid("chfname").value = u.Fname;
    gid("chlname").value = u.Lname;
}

// Refreshes window
function refresh(obj) {

    localStorage.qlcpos = obj.User.Cpos;
    setinactivebtn(obj.User.Inactive);

    const loginscr = gid("login");

    if(obj.Head.Parent.length > 1)
        gid("backbtn").onclick = () => enterlist(obj.Head.Parent)
    else gid("backbtn").onclick = () => qlinit(); // Window refresh if at root

    if(obj.Status == 0) {
        if(obj.Err != undefined && obj.Err != "" && obj.Err != "OK")
            statuspopup(obj.Err);
        loginscr.style.display = "none";
        useredit.style.display = "none";
        gid("hdrtxt").innerHTML = obj.Hstr;
        uminit(obj.User);
        poplist(obj);
        setchnamevals(obj.User);

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
        statuspopup(obj.Err);
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

    const ival = encodeURIComponent(elem.elements["itemval"].value);
    const uname = gls("qluname");
    const skey = gls("qlskey");
    const type = "item";
    const cpos = getcpos();
    const url = "/item?action=new&uname=" + uname + "&skey=" + skey +
                "&type=" + type + "&cpos=" + cpos + "&value=" + ival;

    gid("additemform").reset();

    refresh(await gofetch(url));
}

// Sets appropriate text for timer toggle button
function settimerbuttontext() {

    const timersw = gid("toggletimerval");

    if(qlautoref == undefined) timersw.style.left = "0";
    else timersw.style.left = "20px";
}

// Toggles auto-refresh (10 sec interval)
function toggletimer() {

    if(qlautoref == undefined) {
        qlautoref = setInterval(() => {
            qlinit();
        }, 10000);

    } else {
        clearInterval(qlautoref);
        qlautoref = undefined;
    }

    settimerbuttontext();
}

// Cancels making new user
function cancelmkuser() {

    gid("newuser").style.display = "none";
    gid("login").style.display = "block";
}

// Opens user details edit
function openuseredit() {
    gid("usermenu").style.display = "none";
    gid("useredit").style.display = "block";
}

// Closes user details edit
function closeuseredit() {

    gid("useredit").style.display = "none";
}

// Opens user menu
function openusermenu() {

    getsortmethod();
    gid("usermenu").style.display = "block";
}

// Closes user menu
function closeusermenu() {

    gid("usermenu").style.display = "none";
}

// Opens user registration window
function openmkuser() {

    gid("login").style.display = "none";
    gid("newuser").style.display = "block";
}

// Initialize / refresh frontend
async function qlinit() {

    const uname = gls("qluname");
    const skey = gls("qlskey");
    const url = "/user?action=valskey&uname=" + uname + "&skey=" + skey;

    refresh(await gofetch(url));
}

// Init sequence on (re)load
window.onload = () => {
    qlinit();
};
