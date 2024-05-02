#!/usr/bin/env python3

import os
import json
import getpass
import requests
import argparse
from pathlib import Path

# Configureable constants
CFNAME = ".qldata"
ENDPOINT = "http://localhost:9955"

# Expanded constants (do not edit)
ENDPOINTUSER = ENDPOINT + "/user"
ENDPOINTITEM = ENDPOINT + "/item"
UFNAME = os.path.expanduser('~') + "/" + CFNAME

PDESC = '''\
Quicklist CLI actions:
    login:      Logs user in
    logout:     Logs user out
    list:       Lists contents of current list
    new:        Adds new item to current list
    toggletype: Changes item type for [arg] (item / list)
    close:      Closes item [arg]
    open:       Reopens closed item [arg]
    enter:      Changes current list to [arg]
    back:       Changes current list to parent
    pwd:        Prints current list directory
'''

# Terminal ANSI codes for text decoration
class color:
   RED = '\033[91m'
   BOLD = '\033[1m'
   END = '\033[0m'

# Prints list item to screen
def printitem(item, inact):
    if item["Active"]:
        print(item["Value"])
    elif inact and item["Active"] == False:
        print(color.RED, item["Value"], color.END, sep="")

# Prints list item to screen
def printlist(item, inact):
    clen = "0"
    if item["Contents"] != None:
        clen = str(len(item["Contents"]))

    pline = item["Value"] + " (" + clen + ")"

    if item["Active"]:
        print(color.BOLD, pline, color.END, sep="")
    elif inact and item["Active"] == False:
        print(color.BOLD, pline, color.END, sep="")

# Prints contents list to terminal
def printcontents(contents, inact):
    for li in contents:
        if li["Type"] == "item":
            printitem(li, inact)
        elif li["Type"] == "list":
            printlist(li, inact)

# Writes user data to file
def updateufile(resp):
    try:
        with open(UFNAME, "r") as f:
            data = json.load(f)
            oskey = data["User"]["Skey"]
            if resp["User"]["Skey"] == None or len(resp["User"]["Skey"]) < 1:
                resp["User"]["Skey"] = oskey
    except:
        pass

    with open(UFNAME, "w") as f:
        json.dump(resp, f, indent=4)

# Opens data file and returns contents
def getufile():
    with open(UFNAME, "r") as f:
        data = json.load(f)
        return data

# Performs logout (removal of credentials file)
def logout():
    try:
        Path.unlink(UFNAME)
    except:
        pass

# Returns ID for first found item with value val
def getidbyval(val):
    data = getufile()

    for li in data["Contents"]:
        if li["Value"] == val:
            return li["ID"]

    return None

# Attempts user login
def loginuser(inact):
    uname = input("Enter username: ")
    passwd = getpass.getpass("Enter pass: ")
    data = None

    call = {"action": "login",
            "uname": uname,
            "pass": passwd
           }

    try:
        data = requests.post(ENDPOINTUSER, data=call).json()

        if data["Status"] == 0:
            updateufile(data)
        else:
            print("Login failed")

    except:
        print("Could not connect to", ENDPOINTUSER)

    return data

# Wrapper for window refresh - checking for errors
def updatewr(resp, inact, pvals):

    if pvals and resp["Contents"] != None and len(resp["Contents"]) > 0:
        printcontents(resp["Contents"], inact)

    if len(resp["Err"]) > 0:
        print(resp["Err"])

    if resp["Status"] == 0:
        updateufile(resp)
    else:
        logout()

# Checks for user credentials and attempts login
def checklogin(inact):
    data = None
    try:
        data = getufile()
    except:
        data = loginuser(inact)

    if data["Status"] != 0:
        logout()

    if len(data["Err"]) > 0:
        print(data["Err"])

    return data

# Returns skeleton struct for api call
def mkcallskel(data, action):
    return {"uname":    data["User"]["Uname"],
            "skey":     data["User"]["Skey"],
            "cpos":     data["User"]["Cpos"],
            "action":   action,
            "type":     None,
            "id":       None,
           }

# Refreshes window
def refresh(data, inact, pvals):
    call = mkcallskel(data, "valskey")
    try:
        updatewr(requests.post(ENDPOINTUSER, data=call).json(), inact, pvals)
    except:
        print("Could not connect to", ENDPOINTUSER)

# Shows header string
def showhdr(data):
    for i in data["Hvals"]:
        print(i + "/", end='')
    print()

# Adds item to list
def additem(data, val, inact):
    call = mkcallskel(data, "new")
    call["type"] = "item"
    call["value"] = val

    try:
        updatewr(requests.post(ENDPOINTITEM, data=call).json(), inact, True)
    except:
        print("Could not connect to", ENDPOINTITEM)

# Makes call to item handler
def ihcall(data, val, inact, action):
    call = mkcallskel(data, action)
    call["id"] = getidbyval(val)

    if call["id"]:
        try:
            updatewr(requests.post(ENDPOINTITEM, data=call).json(), inact, True)
        except:
            print("Could not connect to", ENDPOINTITEM)
    else:
        print("No item with value", val, "found")

# Makes call to user handler
def uhcall(data, val, inact, action):
    call = mkcallskel(data, action)
    call["id"] = data["Head"]["Parent"] if val == None else getidbyval(val)

    if call["id"] and len(call["id"]) > 0:
        try:
            updatewr(requests.post(ENDPOINTUSER, data=call).json(), inact, True)
        except:
            print("Could not connect to", ENDPOINTUSER)
    elif call["id"]:
        print("No item with value", val, "found")


# Calls appropriate function based on cli args
def launch(args):
    match args.action:

        case "login":
            loginuser(args.i)

        case "logout":
            logout()

        case "list":
            data = checklogin(args.i)
            if data:
                refresh(data, args.i, True)

        case "new":
            data = checklogin(args.i)
            if data and args.arg:
                additem(data, args.arg, args.i)
            else:
                print("Please provide item value")

        case "toggletype" | "close" | "open":
            data = checklogin(args.i)
            if data and args.arg:
                ihcall(data, args.arg, args.i, args.action)
            else:
                print("Please provide item value")

        case "pwd":
            data = checklogin(args.i)
            if data:
                refresh(data, args.i, False)
                showhdr(data)

        case "enter":
            data = checklogin(args.i)
            if data:
                uhcall(data, args.arg, args.i, "cspos")

        case "back":
            data = checklogin(args.i)
            if data:
                uhcall(data, None, args.i, "cspos")

        case _:
            print("Invalid action")

# Creates and compounds cli args
parser = argparse.ArgumentParser(formatter_class =
                                 argparse.RawDescriptionHelpFormatter,
                                 prog="qlcli", description=PDESC)
parser.add_argument("action", help="action as per description above")
parser.add_argument("arg", help="action-specific argument", nargs="?")
parser.add_argument("-i", action="store_const", const=True, help="show inactive items")
args = parser.parse_args()

launch(args)
