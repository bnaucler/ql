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

// Shows warning when attempting to delete user account
function rmuserwarning() {

    gid("useredit").style.display = "none";
    warning("", "", "Delete user account forever?", "deluser", rmuser)
}

// Requests removal of user account
async function rmuser(ID, action) {

    const uname = gls("qluname");
    const skey = gls("qlskey");
    const url = "/user?action=rm&uname=" + uname + "&skey=" + skey;

    refresh(await gofetch(url));
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

// Processes item change request
async function edititem(ID, action, val) {

    const uname = gls("qluname");
    const skey = gls("qlskey");
    const cpos = getcpos();
    const url = "/item?action=" + action + "&uname=" + uname + "&skey=" + skey +
                "&cpos=" + cpos + "&id=" + ID + "&value=" + val;

    refresh(await gofetch(url));
}

// Shows removal warning window
function warning(ID, clen, wtxt, action, efunc) {

    const pdiv = gid("ui");
    const mdiv = mkobj("div", "contextmenu");
    const yesbtn = mkobj("button", "menubutton", "Do it");
    const nobtn = mkobj("button", "menubutton", "Cancel");
    const cmheader = mkobj("div", "menuheader", wtxt);

    mdiv.appendChild(cmheader);
    mdiv.appendChild(yesbtn);
    mdiv.appendChild(nobtn);
    pdiv.appendChild(mdiv);

    yesbtn.onclick = () => { mdiv.remove(); efunc(ID, action); }
    nobtn.onclick = () => mdiv.remove();
}

// Wrapper to check for empty list and show warning
function rmitemwrapper(ID, clen) {

    if(clen == 0) edititem(ID, "close");
    else warning(ID, clen, "Remove non-empty list?", "close", edititem);
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
        warning(ID, clen, "List has contents. Proceed?", "toggletype", edititem);
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

    refresh(obj);
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
    const cbtn = mkobj("button", "closebutton", "cancel");

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

// Requests leaving a shared list
async function leavelist(ID, val) {

    const uname = gls("qluname");
    const skey = gls("qlskey");
    const cpos = getcpos();
    const url = "/item?action=togglemember&uname=" + uname + "&skey=" + skey +
                "&cpos=" + cpos + "&id=" + ID + "&value=" + uname;

    refresh(await gofetch(url));
}

// Requests update of item Href
async function sethref(ID, val) {

    const uname = gls("qluname");
    const skey = gls("qlskey");
    const cpos = getcpos();
    const url = "/item?action=href&uname=" + uname + "&skey=" + skey +
                "&cpos=" + cpos + "&id=" + ID + "&value=" + val;

    refresh(await gofetch(url));
}

// Adds menu option for inactive item
function immenuinactive(ID, mdiv) {

    const restorebtn = mkobj("button", "menubutton", "restore");
    const pdelbtn = mkobj("button", "menubutton", "delete forever");

    pdelbtn.style.background = "var(--col-rm)";
    pdelbtn.style.color = "var(--col-txt)";
    mdiv.appendChild(restorebtn);
    mdiv.appendChild(pdelbtn);
    restorebtn.onclick = () => { mdiv.remove(); edititem(ID, "open"); }
    pdelbtn.onclick = () => { mdiv.remove(); permdel(ID); }
}

// Adds menu option for changing item value
function immenuchval(ID, val, mdiv) {

    const valinput = mkobj("input", "");
    const valbtn = mkobj("button", "menubutton", "change value");
    const showvalbtn = mkobj("button", "menubutton", "edit value");

    valinput.setAttribute("type", "text");
    valinput.placeholder = "new value";
    valinput.id = "valinput";
    valinput.value = val;

    valinput.style.display = "none";
    valbtn.style.display = "none";
    showvalbtn.style.display = "block";

    valbtn.onclick = () => {
        const nval = encodeURIComponent(gid("valinput").value);
        edititem(ID, "chval", nval)
        mdiv.remove();
    }

    showvalbtn.onclick = () => {
        valinput.style.display = "block";
        valbtn.style.display = "block";
        showvalbtn.style.display = "none";
    }

    mdiv.appendChild(valinput);
    mdiv.appendChild(valbtn);
    mdiv.appendChild(showvalbtn);
}

// Adds menu option for active item
function immenuactive(ID, val, mdiv, link, ctbtn) {

    const href = mkobj("input", "");
    const hrefbtn = mkobj("button", "menubutton", "update link");
    const showhrefbtn = mkobj("button", "menubutton", "create link");
    const remhrefbtn = mkobj("button", "menubutton", "remove link");

    href.setAttribute("type", "text");
    href.placeholder = "link address";
    href.id = "hrefinput";
    if(link.length > 0) href.value = link;

    ctbtn.innerHTML = "make list";

    hrefbtn.onclick = () => {
        const hrefv = encodeURIComponent(gid("hrefinput").value);
        sethref(ID, hrefv);
        mdiv.remove();
    }

    showhrefbtn.onclick = () => {
        showhrefbtn.style.display = "none";
        hrefbtn.style.display = "block";
        href.style.display = "block";
    }

    remhrefbtn.onclick = () => {
        sethref(ID, "");
        mdiv.remove();
    }

    if(link == "") {
        showhrefbtn.style.display = "block";
        href.style.display = "none";
        hrefbtn.style.display = "none";
        remhrefbtn.style.display = "none";

    } else {
        showhrefbtn.style.display = "none";
        hrefbtn.style.display = "block";
        href.style.display = "block";
        remhrefbtn.style.display = "block";
    }

    immenuchval(ID, val, mdiv);
    mdiv.appendChild(href);
    mdiv.appendChild(hrefbtn);
    mdiv.appendChild(remhrefbtn);
    mdiv.appendChild(showhrefbtn);
    mdiv.appendChild(ctbtn);
}

// Adds menu option for list when owner
function immenuowner(ID, val, mdiv, ctbtn) {

    const sharebtn = mkobj("button", "menubutton", "share");

    ctbtn.innerHTML = "make item";

    immenuchval(ID, val, mdiv);
    mdiv.appendChild(sharebtn);
    mdiv.appendChild(ctbtn);

    sharebtn.onclick = () => { mdiv.remove(); sharemenu(ID, val); }
}

// Adds menu option for list when member
function immenumember(ID, mdiv) {

    const leavebtn = mkobj("button", "menubutton", "leave shared list");

    leavebtn.style.background = "var(--col-rm)";
    leavebtn.style.color = "var(--col-txtd)";
    mdiv.appendChild(leavebtn);
    leavebtn.onclick = () => { mdiv.remove(); leavelist(ID); }
}

// Opens up item context menu
function immenu(ID, itype, clen, val, active, owner, link) {

    const pdiv = gid("body");
    const mdiv = mkobj("div", "contextmenu");
    const cmheader = mkobj("div", "menuheader", val);
    const ctbtn = mkobj("button", "menubutton");
    const cbtn = mkobj("button", "closebutton", "cancel");

    mdiv.appendChild(cmheader);

    if(!active) immenuinactive(ID, mdiv);
    else if(itype == "item") immenuactive(ID, val, mdiv, link, ctbtn);
    else if(owner == gls("qluname")) immenuowner(ID, val, mdiv, ctbtn);
    else immenumember(ID, mdiv);

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

// Creates and returns an edit icon
function mkediticon() {

    const imdiv = mkobj("div", "itemmenubutton");
    const dot1 = mkobj("div", "dot");
    const dot2 = mkobj("div", "dot");
    const dot3 = mkobj("div", "dot");

    imdiv.appendChild(dot1);
    imdiv.appendChild(dot2);
    imdiv.appendChild(dot3);

    return imdiv
}

// Adds individual list item
function addlistitem(ID, val, itype, active, clen, owner, link) {

    const pdiv = gid("ui");
    const idiv = mkobj("div", "item");
    const ival = mkobj("div", "itemval", val);
    const rmdiv = mkobj("div", "rm");
    const imdiv = mkediticon();

    if(itype == "list") {
        ival.innerHTML = val + " (" + clen + ")";
        ival.style.fontWeight = "700";
        ival.onclick = () => enterlist(ID);
        ival.style.cursor = "pointer";

    } else if(link.length > 0) {
        ival.onclick = () => window.open(link, '_blank').focus();
        ival.style.cursor = "pointer";
        ival.style.textDecoration = "underline";
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

    imdiv.onclick = () => immenu(ID, itype, clen, val, active, owner, link);
}

// Wrapper for processing lists or items separately
function addlistitemwrapper(co) {

    let clen = 0;
    if(co.Contents != null && co.Contents != undefined)
        clen = co.Contents.length;
    addlistitem(co.ID, co.Value, co.Type, co.Active, clen, co.Owner, co.Href);
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

// Adds individual header item and sets link
function mkhstritem(id, val, pdiv) {

    const p = mkobj("p", "pointer", val);
    pdiv.appendChild(p);
    p.onclick = () => enterlist(id);
}

// Creates header string with clickable links
function mkhstr(ids, vals) {

    const pdiv = gid("hdrtxt");
    const ilen = ids.length;

    pdiv.innerHTML = "";

    for(let i = 0; i < ilen; i++) {
        mkhstritem(ids[i], vals[i], pdiv)
        if(i != ilen - 1) {
            const divider = mkobj("p", "", "/");
            pdiv.appendChild(divider);
        }
    }
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
        mkhstr(obj.Hids, obj.Hvals);
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

// Requests password change
async function chpass(elem) {

    const uname = gls("qluname");
    const skey = gls("qlskey");
    const cpos = getcpos();
    const curpass = encodeURIComponent(elem.elements["chpasscur"].value);
    const newpass = encodeURIComponent(elem.elements["chpassnew"].value);
    const url = "/user?action=chpass&uname=" + uname + "&skey=" + skey +
                "&pass=" + curpass + "&cpos=" + cpos + "&value=" + newpass;

    gid("chpassform").reset();

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
