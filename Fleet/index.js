import Docker from 'dockerode'
import axios from 'axios'

const docker = new Docker()

const instance = axios.create({
    baseURL: 'http://localhost:2019/id/cluster/upstreams'
})

const result = await instance.patch('/',[])
console.log(result.data);


let nextPort = 3000
let activePorts = []

async function spawnWorker(hostPort){

    try {
        const container = await docker.createContainer({
        Image:'demo-app',
        name:`fleet-worker-${hostPort}`,
        ExposedPorts:{
            '3000/tcp':{}
        },
        HostConfig:{
            PortBindings: {
                '3000/tcp':[
                    {
                        HostPort: hostPort.toString()
                    }
                ]
            },
            Memory: 128 * 1024 * 1024,
            MemorySwap: 128 * 1024 * 1024,
            NanoCPUs: 1000000000
        }
    })

    await container.start();
    await instance.post('/',{"dial":`localhost:${hostPort}`})
    activePorts.push({id: container.id, port: hostPort})
    console.log(`Spawed new container at ${hostPort}`)
    nextPort++;
    } catch (error) {
        console.error(`error is : ${error}`)
    }
}

let containers = await docker.listContainers({all: true})
if(containers.length != 0){
    await Promise.all(containers.map(async (containerInfo)=>{
        if(containerInfo.Image === 'demo-app'){
            if(containerInfo.State === 'running'){
                await docker.getContainer(containerInfo.Id).stop();
            }
            await docker.getContainer(containerInfo.Id).remove();
            console.log(`Container stopped ${containerInfo.Id}`)
        }
    }))
}


await spawnWorker(nextPort)

console.log(activePorts)
let avgclusterCpuUsage = 0;
let lastScaleTime = 0; 
const COOLDOWN_PERIOD = 15000; 
setInterval(async() => {
    let clusterCpuUsage = 0;
    let activeCount = activePorts.length

    if(activeCount === 0) return;
    if(activeCount >= 20) {
        console.log("Cant add new workers as active workers count has already reached 30");
        return;
    }
    await Promise.all(activePorts.map(async (worker)=> {
        try {
            const stats = await docker.getContainer(worker.id).stats({stream:false})
            const cpuDelta= (stats.cpu_stats.cpu_usage.total_usage - stats.precpu_stats.cpu_usage.total_usage)
            const systemDelta = stats.cpu_stats.system_cpu_usage - stats.precpu_stats.system_cpu_usage
            const cores = stats.cpu_stats.online_cpus
            
            let cpuPercentage = 0.0;
            if(systemDelta > 0 && systemDelta !== null){
                cpuPercentage = (cpuDelta / systemDelta) * cores*100;
            }
            console.log(`Worker on port ${worker.port} CPU: ${cpuPercentage.toFixed(2)}%`);
            clusterCpuUsage += cpuPercentage

        } catch (error) {
            console.error(`Failed to get stats for container ${worker.id}:`, error.message);
        }
        
    }))
    avgclusterCpuUsage = clusterCpuUsage/activeCount;
    console.log(`avgclusterCpuUsage : ${avgclusterCpuUsage}%`);
    console.log(activePorts);


    const now = Date.now()
    if(now - lastScaleTime < COOLDOWN_PERIOD){
        console.log(`Cooldown active. Waiting for cluster to stabilize...`);
        return;
    }

    if(avgclusterCpuUsage > 60){
        console.log("Cpu usage high spinning up new container")
        lastScaleTime = Date.now()
        spawnWorker(nextPort).catch(err => console.error(err))
    }

    if(avgclusterCpuUsage < 20 && activeCount > 1){
        lastScaleTime = Date.now()
        await killworker(activePorts);
    }
    
},5000)

const killworker = async(activePorts) => {
    if(activePorts.length <= 1){
        console.log(`Cant remove the last container`);
        return;
    }

    const workerTokill = activePorts.pop();
    nextPort--;
    const targetIndex = activePorts.length
    try {
        await instance.delete(`/${targetIndex}`)
        console.log(`The ${workerTokill} was removed from dials`);
        
        const container = docker.getContainer(workerTokill.id)
        await container.stop()
        await container.remove()
        console.log(`The ${workerTokill} was successfully killed`);
    } catch (error) {
        activePorts.push(workerTokill)
        nextPort++;
        console.error(`Worker ${workerTokill} was not removed`, error.message)
    }
}
