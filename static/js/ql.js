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

    if(clen == 0) {
        edititem(ID, "close");

    } else {
        warning(ID, clen, "Remove non-empty list?", "close");
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

// Wrapper to check for contents and generate warning when making to item
function toggletypewrapper(ID, itype, clen) {

    if(clen != 0 && itype == "list") {
        warning(ID, clen, "Make list with contents to item?", "toggletype");

    } else {
        toggletype(ID);
    }
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

    if(ismember) {
        undiv.style.color = "var(--col-open)"; // TODO

    } else {
        undiv.style.color = "var(--col-rm)"; // TODO
    }

    undiv.onclick = () => toggleitemmember(oid, u.Uname, ulist);

    return undiv
}

// Populates user list for sharing items
function popshareusers(obj, ulist) {

    const gap = mkobj("div", "smallgap");
    ulist.appendChild(gap);

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
                "&cpos=" + cpos + "&id=" + ID + "&val=" + val;

    ulist.innerHTML = "";
    popshareusers(await gofetch(url), ulist);
}

// Opens up the item share menu
function sharemenu(ID, val) {

    const pdiv = gid("ui");
    const mdiv = mkobj("div", "contextmenu");
    const cmheader = mkobj("div", "menuheader", val);
    const usearch = mkobj("input", "");
    const ulist = mkobj("div", "ulist");
    const searchbtn = mkobj("button", "menubutton", "search");
    const cbtn = mkobj("button", "menubutton", "close");

    usearch.setAttribute("type", "text");

    mdiv.appendChild(cmheader);
    mdiv.appendChild(usearch);
    mdiv.appendChild(ulist);
    mdiv.appendChild(searchbtn);
    mdiv.appendChild(cbtn);
    pdiv.appendChild(mdiv);

    cbtn.onclick = () => mdiv.remove();
    searchbtn.onclick = () => { getshareusers(ID, usearch, ulist); }
}

// Opens up item context menu
function immenu(ID, itype, clen, val) {

    const pdiv = gid("ui");
    const mdiv = mkobj("div", "contextmenu");
    const cmheader = mkobj("div", "menuheader", val);
    const ctbtn = mkobj("button", "menubutton");
    const sharebtn = mkobj("button", "menubutton", "share");
    const cbtn = mkobj("button", "menubutton", "close");

    if(itype == "item") ctbtn.innerHTML = "make list";
    else ctbtn.innerHTML = "make item";

    mdiv.appendChild(cmheader);
    mdiv.appendChild(ctbtn);
    mdiv.appendChild(sharebtn);
    mdiv.appendChild(cbtn);
    pdiv.appendChild(mdiv);

    cbtn.onclick = () => mdiv.remove();
    sharebtn.onclick = () => { mdiv.remove(); sharemenu(ID, val) }
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
        ival.style.background = "var(--col-bglist)";
        ival.onclick = () => enterlist(ID);
        ival.style.cursor = "pointer";
    }

    if(active) {
        rmdiv.onclick = () => rmitemwrapper(ID, clen);

    } else {
        ival.style.background = "var(--col-bginact)";
        rmdiv.style.background = "var(--col-open)";
        rmdiv.onclick = () => edititem(ID, "open");
    }

    idiv.appendChild(ival);
    idiv.appendChild(rmdiv);
    idiv.appendChild(imdiv);
    pdiv.appendChild(idiv);

    imdiv.onclick = () => immenu(ID, itype, clen, val);
}

// Populates list view
function poplist(obj) {

    gid("ui").innerHTML = "";

    console.log(obj);

    const lilen = obj.Contents.length;

    for(let i = lilen - 1; i >= 0; i--) {
        let co = obj.Contents[i];
        let clen = 0;
        if(co.Contents !== null) clen = co.Contents.length;
        addlistitem(co.ID, co.Value, co.Type, co.Active, clen);
    }
}

// Sets correct text to 'show inactive'-button
function setinactivebtn(val) {

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

// Updates user menu
function uminit(u) {

    const initials = u.Fname[0] + u.Lname[0];
    const umbtn = gid("usermenubtn");

    umbtn.innerHTML = initials.toUpperCase();

    console.log(u);
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
        gid("hdrtxt").innerHTML = obj.Hstr;
        uminit(obj.User);
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

// Cancels making new user
function cancelmkuser() {

    gid("newuser").style.display = "none";
    gid("login").style.display = "block";
}

// Opens user menu
function openusermenu() {

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

// Initialize frontend
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
