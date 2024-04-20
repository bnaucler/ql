
# ql / quicklist
Quicklist is a tool for creating / sharing lists. For oneself or sharing with others. It's built to have a minimal and intuitive UI without clutter and low requirements for backend capacity. The UI is optimized for mobile (portrait) usage, and proportions will look odd during desktop use.

There is a public instance running at [ql.bnaucler.se](https://ql.bnaucler.se) if you want to give it try.

## Building
`bin/build.sh` creates the `bin/ql` binary.

## Dependencies
`ql.go` requres import of `bbolt` which serves as the database and `bcrypt` for password hashing. No additional libraries or frameworks are required.

## Usage
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

## Written by
Björn Westerberg Nauclér (mail@bnaucler.se)

## Disclaimer
This piece of software has not been thoroughly tested, use at own risk.

## Contributing
Pull requests welcome!

For now, issues & feature ideas are kept track of in a simple [TODO](TODO.md) list.

## License
MIT (do whatever you want)
