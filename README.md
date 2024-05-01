
# ql / quicklist
Quicklist is a tool for creating / sharing lists, for oneself or with others. It's built to have a minimal and intuitive UI without clutter and low requirements for backend capacity. The interface is designed primarily for mobile use; desktop is a bit of an afterthought.

There is a public instance running at [ql.bnaucler.se](https://ql.bnaucler.se) if you want to give it try.

## Building
`bin/build.sh` creates the `bin/ql` binary.

## Dependencies
`ql.go` requres import of `bbolt` which serves as the database and `bcrypt` for password hashing. No additional libraries or frameworks are required.

## Server usage
Output of `bin/ql -h`:
```
Usage of bin/ql:
  -d string
    	specify database to open (default "./data/ql.db")
  -p int
    	port number to listen (default 9955)
  -u string
    	instance URL
```

The `-u` flag needs to be used at first launch.

## CLI tool usage
The repo includes a simple CLI client `qlcli.py` if you prefer communicating with ql through the terminal. Or just download the script and connect to a remote instance. Make sure to edit the `ENDPOINT` const first, to set remote host address. Per default it points to `localhost:9955`.

Output of `bin/qlcli.py -h`:
```
usage: qlcli [-h] [-i] action [arg]

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

positional arguments:
  action      action as per description above
  arg         action-specific argument

options:
  -h, --help  show this help message and exit
  -i          show inactive items
```

## Written by
Björn Westerberg Nauclér (mail@bnaucler.se)

## Disclaimer
This piece of software has not been thoroughly tested, use at own risk.

## Contributing
Pull requests welcome!

For now, issues & feature ideas are kept track of in a simple [TODO](TODO.md) list.

## License
MIT (do whatever you want)
