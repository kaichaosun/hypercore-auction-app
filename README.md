# Hypercore Auction App

This is a simple auction app that uses the [Hypercore and Hyperswarm](https://docs.pears.com/).


## Run

Install [Pear Runtime CLI](https://docs.pears.com/guides/getting-started) before running the app.

```shell
npm i

# start Alice
pear dev . alice

# start Bob in another terminal
pear dev . bob

# start Charlie in another terminal
pear dev . charlie
```

*Note: You need to wait for all the peers are connected to each other before starting the auction.*

In each terminal, input `help` or any characters for available commands. For example, 
- open an auction, input `open pic1 50`
- bid an auction, input `bid pic1 60`
- close an auction, input `close pic1 60`

## Features

Use Corestore for managing many Hypercores, each auction has its own Hypercore.
Use a static topic for Hyperswarm to connect peers interested in the auction app.

Workflows,
- Alice opens an auction, it first update local Hypercore with some checks, if success then broadcast the auction to all peers.
- Bob and Charlie receives the auction from Alice, first check if auction exist, if exist then check if the auction owner matched, if success then update local corestore
- Bob bids an auction, only higer price is allowed. It first update local Hypercore with some checks, if success then broadcast the bid to all peers.
- Alice and Charlie receives the bid from Bob, first check if auction exist and not closed, if exist then check if the bid price is higher, if success then update local corestore
- More bids
- Alice close the auction with the highest bid price, only the owner of the auction can close it. It first update local Hypercore with new owner of the auction, if success then broadcast the close to all peers.
- Bob and Charlie receives the close from Alice, first check if auction exist and the owner matched, if success then update local corestore with the new owner and other information.


Known issues:
- Terminal close with ctrl+c not working properly
- Later joined or offline peers not able to sync the actions of the auction

