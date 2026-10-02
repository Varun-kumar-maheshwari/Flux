import autocannon from 'autocannon'

async function runTrafficSimulation() {
    console.log("Starting realistic traffic simulation...");

    console.log("Phase 1: Nprmal Traffic (15 seconds)");
    await blast(10, 15);

    console.log("Phase 2: HIGH TRAFFIC SPIKE (30 seconds)");
    await blast(150, 30);

    console.log("Phase 3: Traffic Down (15 seconds)");
    await blast(20, 15);

    console.log("Simulation complete. Watch the orchestrator scale down.");
}

function blast(connections, durationSeconds) {
    return new Promise((resolve) => {
        const instance = autocannon({
            url: 'http://127.0.0.1:8000',
            connections: connections,
            duration: durationSeconds,
            requests: [
                { method: 'GET', path: '/' },         
                { method: 'GET', path: '/delay' },    
                { method: 'GET', path: '/heavy' }     
            ]
        });

        autocannon.track(instance, { renderProgressBar: true });
        
        instance.on('done', resolve);
    });
}

runTrafficSimulation();
setInterval(() => runTrafficSimulation(), 60000)