// Your task is to create a simplified peer-to-peer (P2P) auction solution based on Hyperswarm RPC and Hypercores.

// With the RPC Client, you should be able to open auctions (e.g. selling a picture for 50 USDt). Upon opening the auction, a client should notify other parties in the ecosystem about the opened auction. This means that every client should have a small RPC Server. Other parties can bid on an auction by submitting an offer. Each bid should be propagated to all parties in the ecosystem. Upon completion of an auction, the distributed transaction should be propagated to all nodes as well.

// Sample scenario:

// Client#1 opens auction: sell Pic#1 for 75 USDt
// Client#2 opens auction: sell Pic#2 for 60 USDt
// Client#2 makes bid for Client#1->Pic#1 with 75 USDt
// Client#3 makes bid for Client#1->Pic#1 with 75.5 USDt
// Client#2 makes bid for Client#1->Pic#1 with 80 USDt
// Client#1 closes auction: notifies Client#2, ...Client#..n with details of the sale: Client#2->80 USDt
// Requirements:

// Code should be only in Javascript
// Use Hyperswarm RPC for communication between nodes
// If you are already familiar with the holepunch stack, you can also use other levels of abstraction within the holepunch ecosystem (such as hyperswarm), as long as you add the reasoning for the choice to the readme.
// The solution should be P2P and not a classic client/server architecture
// There's no need for a user interface
// If you need to use a database, use only Hypercore or Hyperbee
// You should not spend more time than 6-8 hours on the task. We know that it's probably not possible to complete the task 100% in the given time.
// If you don't get to the end, just write up what is missing for a complete implementation of the task.
// We also appreciate a short paragraph on how you approached the problem, and how you set your priorities.


/* global Pear */
import b4a from 'b4a'; // Module for buffer-to-string and vice-versa conversions 
import fs from 'bare-fs'
import readline from 'bare-readline'; // Module for reading user input in terminal
import tty from 'bare-tty'; // Module to control terminal behavior
import Corestore from 'corestore'
import Hyperswarm from 'hyperswarm'; // Module for P2P networking and connecting peers


const { teardown, config } = Pear    // Import configuration options and cleanup functions from Pear
const username = config.args.pop()   // Retrieve the username from command-line arguments
const swarm = new Hyperswarm()

const localPeer = b4a.toString(swarm.keyPair.publicKey, 'hex')
console.log(`[info] Local peer pubkey: ${localPeer}`)
const appName = "hypercore-auction-demo-app"
const corestoreLocation = `./auctions/${username}`
fs.rmSync(corestoreLocation, { recursive: true, force: true });
const store = new Corestore(corestoreLocation)
let peersCount = 0

// Unannounce the public key before exiting the process
// (This is not a requirement, but it helps avoid DHT pollution)
teardown(() => swarm.destroy())

const rl = readline.createInterface({
    input: new tty.ReadStream(0),
    output: new tty.WriteStream(1)
})

// When there's a new connection, listen for new messages, and output them to the terminal
swarm.on('connection', peer => {
    const peerPubKey = b4a.toString(peer.remotePublicKey, 'hex')
    console.log(`[info] New peer joined, ${peerPubKey}`)
    peer.on('data', message => processMessage(peerPubKey, message))
    peer.on('error', e => console.log(`Connection error: ${e}`))
})

// When there's updates to the swarm, update the peers count
swarm.on('update', () => {
    if (peersCount != swarm.connections.size) {
        peersCount = swarm.connections.size
        console.log(`[info] Number of connections is now ${swarm.connections.size}`)
    }
})

await joinAuctionPlatform()

rl.input.setMode(tty.constants.MODE_RAW) // Enable raw input mode for efficient key reading
rl.on('data', line => {
    processAction(line)
    rl.prompt()
})
rl.prompt()

async function joinAuctionPlatform() {
    const topic = Buffer.alloc(32).fill(appName)
    const discovery = swarm.join(topic, { client: true, server: true })
    await discovery.flushed()
    console.log(`[info] Joined the global auction platform: ${topic}`)
}

async function processAction(action) {
    let arr = action.trim().split(/\s+/)
    if (arr.length < 3) {
        console.log(`[error] Invalid action: ${action}, input like 'open pic1 50', 'bid pic1 60', 'close pic1 80'`)
        return
    }

    let actionResult = false
    switch (arr[0]) {
        case 'open':
            actionResult = await openAuction(localPeer, arr[1], arr[2])
            break
        case 'bid':
            actionResult = await bidAuction(localPeer, arr[1], arr[2])
            break
        case 'close':
            actionResult = await closeAuction(localPeer, arr[1], arr[2])
            break
        default:
            console.log(`[error] Invalid action: ${action}`)
            return
    }

    if (actionResult) {
        const msg = {
            type: arr[0],
            name: arr[1],
            price: arr[2],
        }
        const peers = [...swarm.connections]
        for (const peer of peers) peer.write(JSON.stringify(msg))
    }
}

async function processMessage(peer, rawMessage) {
    let msg
    try {
        msg = JSON.parse(rawMessage)
    } catch (e) {
        console.log(`[error] Message format error from ${peer}, ${rawMessage}, ${e}`)
        return
    }

    if (msg.type === 'open') {
        openAuction(peer, msg.name, msg.price)
    }

    if (msg.type === 'bid') {
        bidAuction(peer, msg.name, msg.price)
    }

    if (msg.type === 'close') {
        closeAuction(peer, msg.name, msg.price)
    }
}

async function openAuction(peer, name, price) {
    console.log(`[info] Auction opened by ${peer} for ${name} at ${price}`)
    const session = store.session()
    const core = session.get({ name })
    await core.ready()

    let owner = peer

    // only the new owner can reopen the existing auction
    if (core.length != 0) {
        const block = await core.get(core.length - 1)
        const lastAction = JSON.parse(block.toString())
        if (lastAction.type != 'close' || lastAction.owner != peer) {
            console.log(`[error] Auction ${name} can not be reopend by ${peer}`)
            return false
        }
        owner = lastAction.owner
    }

    await updateCore('open', name, owner, peer, price, core)
    await session.close()
    return true
}

async function bidAuction(peer, name, price) {
    console.log(`[info] Bid made by ${peer} for ${name} at ${price}`)
    const session = store.session()
    const core = session.get({ name })
    await core.ready()

    if (core.length == 0) {
        console.log(`[error] Auction ${name} not found`)
        return false
    }

    const block = await core.get(core.length - 1)
    const lastAction = JSON.parse(block.toString())
    if (lastAction.type == 'close') {
        console.log(`[error] Closed auction ${name} can not be bid anymore`)
        return false
    }
    // only allow higher price bid
    if (Number(price) <= Number(lastAction.price)) {
        console.log(`[error] Not allowing lower price bid ${price} for ${name} by ${peer}, should be higher than ${lastAction.price}`)
        return false
    }

    await updateCore('bid', name, lastAction.owner, peer, price, core)
    await session.close()
    return true
}

async function closeAuction(peer, name, price) {
    console.log(`[info] Auction closed by ${peer} for ${name} at ${price}`)
    const session = store.session()
    const core = session.get({ name: name })
    await core.ready()

    if (core.length == 0) {
        console.log(`[error] Auction ${name} not found`)
        return false
    }

    const block = await core.get(core.length - 1)
    const lastAction = JSON.parse(block.toString())

    // only the owner can close the auction
    if (lastAction.owner != peer) {
        console.log(`[error] Auction ${name} can not be closed by ${peer}, because actor is not the owner`)
        return false
    }
    if (lastAction.price != price) {
        console.log(`[error] Auction ${name} can not be closed with different price ${price} by ${peer}, the price should be ${lastAction.price}`)
        return false
    }

    await updateCore('close', name, lastAction.actor, peer, price, core)
    await session.close()
    return true
}

async function updateCore(type, name, owner, actor, price, core) {
    const auction = {
        type,
        name,
        owner,
        actor,
        price,
        time: Date.now()
    }
    await core.append(Buffer.from(JSON.stringify(auction)))
    console.log(`[info] Updated core length: ${core.length} for auction: ${name}`)
}
