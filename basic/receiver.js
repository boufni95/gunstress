const Gun = require('gun')
const Crypto = require('crypto')
const SEA = require('gun/sea')
const EventEmitter = require('events');
const myEmitter = new EventEmitter();
require('gun/lib/open')
require('gun/lib/load')
const gun = new Gun({
    axe:false,
    //multicast:false,
    //peers: ["http://127.0.0.1:8765/gun"],
    })
const context = {}
const nodeID = process.argv[2] || 'SomeCommonDefaultNode'
const user = gun.user()
myEmitter.on('retryCreate', () => {
    const alias = Crypto.randomBytes(8).toString('hex')
    const pass = Crypto.randomBytes(8).toString('hex')
    user.create(alias, pass, ackC => {
        if(ackC.err) {
            myEmitter.emit('retryCreate')
        } else {
            context.alias = alias
            context.pass = pass
            myEmitter.emit('retryAuth')
        }
    })
})

myEmitter.on('retryAuth', () => {
    const {alias,pass} = context
    user.auth(alias, pass, ackA => {
        if(ackA.err){
            setTimeout(() => {
                user.leave()
                myEmitter.emit('retryAuth')
            })
        } else {
            context.myPub = user._.sea.pub
            console.log(`USER PUB>${user._.sea.pub}>`)
            myEmitter.emit('retryMySecret')
        }
    })
})

myEmitter.on('retryMySecret', () => {
    console.log('doing my secret')
    SEA.secret(user._.sea.epub, user._.sea)
    .then(secret => {
        context.mySecret = secret
        myEmitter.emit('ready')
    })
    .catch(e => myEmitter.emit('retryMySecret'))
})
const registered = {}
myEmitter.on('ready',() => {
    console.log('doing ready')
    const {myPub,mySecret} = context
    gun.get(nodeID).open(up => {
        console.log(up)
        Object.values(up).forEach(e => {
            if(!registered[e]){
                registered[e] = true
                subscribeToSender(e,myPub,mySecret)
            }
        })
    })
})

const processedRandoms = {}
const subscribeToSender = (pub,myPub,secret) => {
    console.log('subbing')
    gun.user(pub).get(myPub).open(obj => {
        Object.values(obj).forEach( random => {
            if(!processedRandoms[random]){
                processedRandoms[random] = true
                user.get(random).put('ok')
            }
        })
    })
}

setTimeout(() => myEmitter.emit('retryCreate'),1000)