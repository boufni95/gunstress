const { spawn } = require("child_process");
const { performance } = require('perf_hooks')
const Crypto = require('crypto')
const EventEmitter = require('events');
const myEmitter = new EventEmitter();
const n =2
const timeout = '1'
const randomNode = Crypto.randomBytes(10).toString('hex')
const context = {}
const ps = spawn("node", ["basic/receiver",randomNode]);

ps.stdout.on("data", data => {
    //console.log(`stdout: ${data}`);
    const dataS = data.toString()
    if(dataS.startsWith('USER PUB>')){
        const pub = dataS.split('>')[1]
        context.pub = pub
        myEmitter.emit('pubReady')
    }
});
ps.stderr.on("data", data => {
    console.log(`stderr: ${data}`);
});
ps.on('error', (error) => {
    console.log(`error: ${error.message}`);
});
ps.on("close", code => {
    console.log(`child process exited with code ${code}`);
});

myEmitter.on('pubReady',() => {
    for( let i = 0; i< n ; i++){
        RunSender(i)
    }
})
const responses = Array(n)
const printRes = () => {
    console.clear()
    for(let i = 0; i< responses.length;i++){
        const data = responses[i] || [0,0,0,0]
        const [confirmedSum,sentSum,reqCount,runningTime] = data
        console.log(`${i+1}: ${confirmedSum}/${sentSum} diff:${confirmedSum - sentSum} n sent: ${reqCount}  running:${Math.round(runningTime/1000)} seconds `)
    }
}
const RunSender = (index) => {
    const {pub} = context
    console.log(pub)
    const ps = spawn("node", ["basic/sender",randomNode,pub,timeout]);
    ps.stdout.on("data", data => {
        const dataS = data.toString()
        //console.log(`stdout ${index}: ${data}`);
        //return
        dataS.split('\n').forEach(line => {
            if(line.startsWith('SUM REPORT>')){
                const report = line.split('>')[1]
                responses[index] = report.split(':')
                printRes()
            }
        })
    });
    ps.stderr.on("data", data => {
        console.log(`stderr ${index}: ${data}`);
    });
    
    ps.on('error', (error) => {
        console.log(`error ${index}: ${error.message}`);
    });
    
    ps.on("close", code => {
        console.log(`child process ${index} exited with code ${code}`);
    });
}

