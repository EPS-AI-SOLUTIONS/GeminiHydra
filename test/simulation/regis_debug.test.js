import { jest } from '@jest/globals';

// 1. Mock Ollama Client BEFORE importing swarm
// We use unstable_mockModule for ESM mocking
jest.unstable_mockModule('../../src/ollama-client.js', () => ({
  checkHealth: jest.fn().mockResolvedValue({ available: true, models: ['phi3:mini', 'llama3.2:3b'] }),
  listModels: jest.fn().mockResolvedValue([{ name: 'phi3:mini' }, { name: 'llama3.2:3b' }]),
  generate: jest.fn().mockImplementation(async (model, prompt) => {
    // SIMULATION LOGIC: Return different responses based on the prompt "step"
    
    // Step 1: Speculation (Fast Model)
    if (prompt.includes('You are a fast research scout')) {
      return { response: "SPECULATION: The VectorStore uses a simple JS array which grows indefinitely. Risk of OOM on large datasets." };
    }

    // Step 2: Planning
    if (prompt.includes('You are the planner')) {
      return { response: JSON.stringify({
        steps: [
          "Analyze src/memory/vector-store.js for memory retention.",
          "Research Rust integration via FFI or WASM.",
          "Propose architecture change."
        ]
      })};
    }

    // Step 3: Agents (This is what we want to debug!)
    if (prompt.includes('You are Regis')) {
      console.log('\n[DEBUG] 🧠 REGIS IS THINKING...');
      console.log(`[DEBUG] Context received: VectorStore analysis`);
      return { 
        response: "ANALYSIS (Regis): The current implementation keeps all vectors in heap memory (V8). Node.js has a limit of ~2GB by default. \n\nRECOMMENDATION: Offload vector storage to a localized SQLite instance or use a Rust binary via generic-node-api to manage raw pointers.",
        model: 'phi3:mini' 
      };
    }
    
    // Yennefer might also be called
    if (prompt.includes('You are Yennefer')) {
      return { response: "ARCHITECTURAL NOTE: Implementing a Rust backend requires binding generation." };
    }

    // Step 4: Synthesis
    if (prompt.includes('You are the synthesizer')) {
      return { response: "FINAL REPORT: The memory leak is due to unbounded array growth. We recommend rewriting the VectorStore in Rust." };
    }
    
    // Step 5: Log
    return { response: "Task completed." };
  })
}));

// 2. Import Swarm (Dynamic import needed after mock)
const { runSwarm } = await import('../../src/swarm.js');
const { AGENTS } = await import('../../src/constants.js');

describe('🔍 Regis Debug Simulation', () => {
  
  test('Should activate Regis for complex analysis task', async () => {
    console.log('\n🚀 STARTING GEMINI CLI SIMULATION...');
    console.log('📝 Prompt: "Analyze potential memory leak in VectorStore..."');

    const result = await runSwarm({
      prompt: "Analyze potential memory leak in VectorStore implementation and suggest Rust optimization.",
      agents: ['Regis', 'Yennefer'], // Forcing these agents for the test
      title: 'Debug Regis',
      saveMemory: false
    });

    console.log('\n📊 SWARM RESULT DEBUG:');
    console.log('---------------------------------------------------');
    
    // Check if Regis was executed
    const regisResult = result.agents.find(a => a.name === 'Regis');
    
    if (regisResult) {
        console.log(`✅ Agent Active: ${regisResult.name}`);
        console.log(`🤖 Model Used:   ${regisResult.model}`);
        console.log(`📄 Output:\n${regisResult.preview}`);
    } else {
        console.log('❌ Regis was not activated!');
    }
    
    console.log('---------------------------------------------------');
    console.log(`🏁 Final Synthesis: ${result.final}`);

    expect(regisResult).toBeDefined();
    expect(regisResult.model).toContain('phi3'); // Regis uses phi3:mini
    expect(regisResult.preview).toContain('heap memory');
  });
});
