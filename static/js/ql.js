// Alias to reduce typing
const gid = document.getElementById.bind(document);
const gls = localStorage.getItem.bind(localStorage);

const TIMERINTERVAL = 10000; // ms between autorefresh calls

let qlautoref;

// HTTP request wrapper
async function gofetch(url) {

    const resp = await fetch(url);

    if(resp.ok) return resp.json();
}

// Returns DOM object of requested type, with class & text defined if requested
function mkobj(type, cl, txt) {

    let ret = document.createElement(type);

    if(cl !== undefined && cl != "") ret.classList.add(cl);

    if(txt !== undefined) {
        const tc = document.createTextNode(txt);
        ret.appendChild(tc);
    }

    return ret;
}

// Retrieves current position. Logs out if unavailable
function getcpos() {

    let cpos = gls("qlcpos");

    if(cpos == undefined || cpos.Length < 1) logoutuser();
    else return cpos;
}

// Reads ident data from localstorage and creates string for fetch call
function getidentstring() {

    const uname = gls("qluname");
    const skey = gls("qlskey");
    const cpos = getcpos();

    return "uname=" + uname + "&skey=" + skey + "&cpos=" + cpos;
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
async function loginuser() {

    const uname = encodeURIComponent(gid("unameinput").value);
    const pass = encodeURIComponent(gid("passinput").value);
    const url = "/user?action=login&uname=" + uname + "&pass=" + pass;

    gid("loginform").reset();

    trylogin(await gofetch(url));
}

// Attempts creation of new user
async function mkuser() {

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

    showmenu("none");
    warning("", "", "Delete user account forever?", "deluser", rmuser)
}

// Requests removal of user account
async function rmuser(ID, action) {

    const istr = getidentstring();
    const url = "/user?action=rm&" + istr;

    refresh(await gofetch(url));
}

// Requests change of user details
async function chuser() {

    const istr = getidentstring();
    const fname = encodeURIComponent(gid("chfname").value);
    const lname = encodeURIComponent(gid("chlname").value);
    const url = "/user?action=edit&" + istr +
                "&fname=" + fname + "&lname=" + lname;

    refresh(await gofetch(url));
}

// Removes stored user data and displays login screen
function logoutuser() {

    showpopup("login");
    localStorage.qluname = "";
    localStorage.qlskey = "";
    gid("ui").innerHTML = "";
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

    yesbtn.onclick = () => { mdiv.remove(); efunc(action, ID, ""); }
    nobtn.onclick = () => mdiv.remove();
}

// Wrapper to check for empty list and show warning
function rmitemwrapper(ID, clen) {

    if(clen == 0) edititem("close", ID, "");
    else warning(ID, clen, "Remove non-empty list?", "close", edititem);
}

// Requests changing type (list/item) per object ID
async function toggletype(ID) {

    const istr = getidentstring();
    const url = "/item?action=toggletype&" + istr + "&id=" + ID;

    refresh(await gofetch(url));
}

// Wrapper to check for contents and generate warning when making to item
function toggletypewrapper(ID, itype, clen) {

    if(clen != 0 && itype == "list")
        warning(ID, clen, "List has contents. Proceed?", "toggletype", edititem);
    else toggletype(ID);
}

// Requests toggle of item membership
async function toggleitemmember(ID, val, ulist) {

    const istr = getidentstring();
    const url = "/item?action=togglemember&" + istr +
                "&id=" + ID + "&value=" + val;

    ulist.innerHTML = "";
    popshareusers(await gofetch(url), ulist);
}

// Create confirmation window for member toggle request TODO: merge with warning()
function memberwarning(oid, uname, ulist, wtxt) {

    const pdiv = gid("ui");
    const mdiv = mkobj("div", "contextmenu");
    const yesbtn = mkobj("button", "menubutton", "Do it");
    const nobtn = mkobj("button", "menubutton", "Cancel");
    const cmheader = mkobj("div", "menuheader", wtxt);

    mdiv.appendChild(cmheader);
    mdiv.appendChild(yesbtn);
    mdiv.appendChild(nobtn);
    pdiv.appendChild(mdiv);

    yesbtn.onclick = () => { mdiv.remove(); toggleitemmember(oid, uname, ulist); }
    nobtn.onclick = () => mdiv.remove();
}

// Adds a non-member entry to share list
function addshareuser(u, oid, ismember, ulist) {

    const nstr = u.Fname + " " + u.Lname + " (@" + u.Uname + ")";
    const undiv = mkobj("div", "slname", nstr);
    let wtxt;

    if(!ismember) {
        undiv.style.color = "var(--col-rm)";
        wtxt = "Add " + u.Uname + " to shared list?";

    } else {
        wtxt = "Remove " + u.Uname + " from shared list?";
    }

    undiv.onclick = () => {
        memberwarning(oid, u.Uname, ulist, wtxt);
        gid("usearchinput").value = "";
        showmenu("sharemenu");
    }

    return undiv
}

// Populates user list for sharing items
function popshareusers(obj, ulist) {

    if(obj.Status != 0 || obj.Err == undefined || obj.Err != "")
        statuspopup(obj.Err);
    else poplist(obj);

    if(obj.Umembers != undefined) {
        const membheader = mkobj("div", "subheader", "list members:");
        ulist.appendChild(membheader);
        for(const u of obj.Umembers)
            ulist.appendChild(addshareuser(u, obj.Ref, true, ulist));
    }

    if(obj.Ulist != undefined && obj.Ulist.length > 0) {
        const otherheader = mkobj("div", "subheader", "click to add:");
        ulist.appendChild(otherheader);
        for(const u of obj.Ulist)
            ulist.appendChild(addshareuser(u, obj.Ref, false, ulist));
    }

    const gap = mkobj("div", "microgap");
    ulist.appendChild(gap);

    refresh(obj);
}

// Requests items to populate share menu
async function getshareusers(ID, usearch, ulist) {

    const istr = getidentstring();
    const val = encodeURIComponent(usearch.value);
    const url = "/user?action=get&" + istr + "&id=" + ID + "&value=" + val;

    ulist.innerHTML = "";
    popshareusers(await gofetch(url), ulist);
}

// Opens up the item share menu
function opensharemenu(ID, val) {

    const mdiv = gid("sharemenu");
    const cmheader = mkobj("div", "menuheader", val);
    const usearch = mkobj("input", "");
    const ulist = mkobj("div");
    const searchbtn = mkobj("button", "menubutton", "search");
    const cbtn = mkobj("button", "closebutton", "cancel");

    mdiv.innerHTML = "";
    showmenu("sharemenu");

    usearch.setAttribute("type", "text");
    usearch.placeholder = "user search";
    usearch.id = "usearchinput";

    mdiv.appendChild(cmheader);
    mdiv.appendChild(ulist);
    mdiv.appendChild(usearch);
    mdiv.appendChild(searchbtn);
    mdiv.appendChild(cbtn);

    cbtn.onclick = () => showmenu("none");
    searchbtn.onclick = () => { getshareusers(ID, usearch, ulist); }

    getshareusers(ID, "", ulist);
}

// Sends request to item handler
async function edititem(action, ID, val) {

    const istr = getidentstring();
    const url = "/item?action=" + action + "&" + istr +
                "&id=" + ID + "&value=" + val;

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
    restorebtn.onclick = () => { showmenu("none"); edititem("open", ID); }
    pdelbtn.onclick = () => { showmenu("none"); edititem("permdel", ID); }
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
        edititem("chval", ID, nval)
        showmenu("none");
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
        edititem("href", ID, hrefv);
        showmenu("none");
    }

    showhrefbtn.onclick = () => {
        showhrefbtn.style.display = "none";
        hrefbtn.style.display = "block";
        href.style.display = "block";
    }

    remhrefbtn.onclick = () => {
        edititem("href", ID, "");
        showmenu("none");
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

    sharebtn.onclick = () => { opensharemenu(ID, val); }
}

// Adds menu option for list when member
function immenumember(ID, mdiv) {

    const leavebtn = mkobj("button", "menubutton", "leave shared list");

    leavebtn.style.background = "var(--col-rm)";
    leavebtn.style.color = "var(--col-txtd)";
    mdiv.appendChild(leavebtn);
    leavebtn.onclick = () => {
        showmenu("none");
        edititem("togglemember", ID, gls("qluname"));
    }
}

// Opens up item context menu
function immenu(ID, itype, clen, val, active, owner, link) {

    showmenu("immenu");
    mdiv = gid("immenu");
    mdiv.innerHTML = "";

    const cmheader = mkobj("div", "menuheader", val);
    const ctbtn = mkobj("button", "menubutton");
    const cbtn = mkobj("button", "closebutton", "cancel");

    mdiv.appendChild(cmheader);

    if(!active) immenuinactive(ID, mdiv);
    else if(itype == "item") immenuactive(ID, val, mdiv, link, ctbtn);
    else if(owner == gls("qluname")) immenuowner(ID, val, mdiv, ctbtn);
    else immenumember(ID, mdiv);

    mdiv.appendChild(cbtn);

    cbtn.onclick = () => showmenu("none");
    ctbtn.onclick = () => { showmenu("none"); toggletypewrapper(ID, itype, clen); }
}

// Requests list contents and sets cpos
async function enterlist(ID) {

    const istr = getidentstring();
    const url = "/user?action=cspos&" + istr + "&id=" + ID;

    refresh(await gofetch(url));
}

// Creates and returns an edit icon
function mkediticon() {

    const ret = mkobj("div", "itemmenubutton");

    for(let i = 0; i++ < 3;) ret.appendChild(mkobj("div", "dot"));

    return ret
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
        rmdiv.onclick = () => edititem("open", ID, "");
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

    gid("toggleinactiveval").style.left = val ? "20px" : "0";
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

    // Reset timer if defined
    if(qlautoref !== undefined) {
        qlautoref = setTimeout(() => {
            qlinit();
        }, TIMERINTERVAL);
    }

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
        gid("chfname").value = obj.User.Fname;
        gid("chlname").value = obj.User.Lname;

    } else {
        loginscr.style.display = "block";
    }
}

// Processes login response
function trylogin(obj) {

    showmenu("none");

    if(obj.Status == 0) {
        localStorage.qluname = obj.User.Uname;
        localStorage.qlskey = obj.User.Skey[0];
        localStorage.qlcpos = obj.User.Cpos;
        refresh(obj);

    } else {
        showmenu("login");
        statuspopup(obj.Err);
    }
}

// Toggles showing inactive items
async function toggleinactive() {

    const istr = getidentstring();
    const url = "/user?action=toggleinactive&" + istr;

    refresh(await gofetch(url));
}

// Requests password change
async function chpass(elem) {

    const istr = getidentstring();
    const curpass = encodeURIComponent(elem.elements["chpasscur"].value);
    const newpass = encodeURIComponent(elem.elements["chpassnew"].value);
    const url = "/user?action=chpass&" + istr + "&pass=" + curpass +
                "&value=" + newpass;

    gid("chpassform").reset();

    refresh(await gofetch(url));
}

// Adds item to list
async function additem(elem) {

    const istr = getidentstring();
    const ival = encodeURIComponent(elem.elements["itemval"].value);
    const type = "item";
    const url = "/item?action=new&" + istr + "&type=" + type + "&value=" + ival;

    gid("additemform").reset();

    refresh(await gofetch(url));
}

// Sets appropriate text for timer toggle button
function settimerbuttontext() {

    const timersw = gid("toggletimerval");

    if(qlautoref == undefined) timersw.style.left = "0";
    else timersw.style.left = "20px";
}

// Toggles auto-refresh
function toggletimer() {

    if(qlautoref == undefined) {
        qlautoref = setTimeout(() => {
            qlinit();
        }, TIMERINTERVAL);

    } else {
        clearInterval(qlautoref);
        qlautoref = undefined;
    }

    settimerbuttontext();
}

// Iterates through elem list and selected popups to show / hide
function setdisp(elems, val) {

    for(const i of elems) gid(i).style.display = i == val ? "block" : "none";
    gid("closeall").style.display = val === undefined ? "none" : "block";
}

// Opens the appropriate menu, closing all others
function showmenu(val) {

    const elems = ["login", "mkuser", "usermenu", "useredit", "immenu", "sharemenu"];

    switch(val) {
        case "none":
            setdisp(elems);
            break;

        case "login":
            gid("loginform").reset();
            setdisp(elems, val);
            break;

        case "mkuser":
            gid("newuserform").reset();
            setdisp(elems, val);
            break;

        case "usermenu":
            setdisp(elems, val);
            break;

        case "useredit":
            setdisp(elems, val);
            break;

        case "immenu":
            setdisp(elems, val);
            break;

        case "sharemenu":
            setdisp(elems, val);
            break;

        default:
            break;
    }
}

// Initialize / refresh frontend
async function qlinit() {

    const istr = getidentstring();
    const url = "/user?action=valskey&" + istr;

    refresh(await gofetch(url));
}

// Init sequence on (re)load
window.onload = () => {
    qlinit();
};
