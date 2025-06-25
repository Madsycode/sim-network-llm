import { GoogleGenerativeAI } from '@google/generative-ai';
import { readFileSync } from 'fs';
import neo4j from 'neo4j-driver';
import express from 'express';
import dotenv from 'dotenv';

// --- CONFIGURATION ---
dotenv.config();
const app = express();
const PORT = process.env.PORT || 3000;

// --- NEO4J & GEMINI SETUP ---
const { NEO4J_URI, NEO4J_USER, NEO4J_PASS, GEMINI_API, GEMINI_MODEL } = process.env;

if (!NEO4J_URI || !NEO4J_USER || !NEO4J_PASS || !GEMINI_API || !GEMINI_MODEL) {
  throw new Error("Missing environment variables. Check your .env file.");
}

const driver = neo4j.driver(NEO4J_URI, neo4j.auth.basic(NEO4J_USER, NEO4J_PASS));
const genAI = new GoogleGenerativeAI(GEMINI_API);
const model = genAI.getGenerativeModel({ model: GEMINI_MODEL });

// --- MIDDLEWARE ---
app.use(express.json());
app.use(express.static('static')); 

// --- SYSTEM PROMPT ---
const systemPrompt = readFileSync('resources/prompt.md', 'utf-8').trim();

// --- API ENDPOINT ---
app.post('/api/query', async (req, res) => {
  const userQuestion = req.body.question;

  if (!userQuestion) {
    return res.status(400).json({ message: "Question is required." });
  }

  let session;
  try {
    // Step 1: Generate Cypher Query from Gemini
    console.log(`[1/3] Sending question to Gemini: "${userQuestion}"`);
    const chat = model.startChat({
      history: [{ role: "user", parts: [{ text: systemPrompt }] }],
      generationConfig: { maxOutputTokens: 1000 },
    });

    const result = await chat.sendMessage(userQuestion);
    const response = result.response;
    let generatedCypher = response.text().trim();
    
    // Clean up potential markdown code fences
    if (generatedCypher.startsWith('```cypher')) {
      generatedCypher = generatedCypher.substring(9);
    } else if (generatedCypher.startsWith('```')) {
      generatedCypher = generatedCypher.substring(3);
    }
    if (generatedCypher.endsWith('```')) {
        generatedCypher = generatedCypher.slice(0, -3);
    }
    generatedCypher = generatedCypher.trim();
    
    console.log(`[2/3] Received Cypher from Gemini:\n${generatedCypher}`);

    // Step 2: Execute Cypher Query against Neo4j
    session = driver.session();
    const dbResult = await session.run(generatedCypher);
    
    // Convert Neo4j's integer types and records to standard JS types for JSON serialization
    const dbResults = dbResult.records.map(record => {
      const obj = {};
      record.keys.forEach(key => {
        obj[key] = neo4j.graph.isNode(record.get(key)) || neo4j.graph.isRelationship(record.get(key)) 
          ? record.get(key).properties 
          : record.get(key);
      });
      return obj;
    });
    
    console.log(`[3/3] Successfully executed query. Found ${dbResults.length} records.`);

    // Step 3a: Generate reasoning from Gemini
    console.log(`[4/4] Generating reasoning for the query.`);
    const reasoningChat = model.startChat({
      history: [{ role: "user", parts: [{ text: `You are an expert in 5G network management and you are asked a question about the network to perform reasoning tasks. 
      You should reason about the provided question based only on the provided knowledge graph results.` }] }],
      generationConfig: { maxOutputTokens: 1000 },
    });
    const reasoningResult = await reasoningChat.sendMessage(`\nQUESTION: 
      ${userQuestion}\nKNOWLEDGE: ${JSON.stringify(dbResults)}\n`);
    const reasoningResponse = reasoningResult.response.text().trim();
    
    // Step 3: Send results back to the client
    res.json({
      reasoningResponse,
      generatedCypher,
      userQuestion,
      dbResults
    });

  } catch (error) {
    console.error("An error occurred in the /api/query endpoint:", error);
    res.status(500).json({ message: error.message || "An internal server error occurred." });
  } finally {
    if (session) {
      await session.close();
    }
  }
});

// --- GRAPH API ENDPOINT ---
app.get('/api/graph', async (req, res) => {
  let session;

  try {
    // Use explicit READ session
    session = driver.session({ defaultAccessMode: neo4j.session.READ });

    // Query graph pattern (no trailing semicolon needed)
    const result = await session.run('MATCH (n) OPTIONAL MATCH (n)-[r]->(m) RETURN n, r, m');

    const nodesMap = new Map();
    const links = [];

    result.records.forEach(record => {
      const n = record.get('n');
      const m = record.get('m');
      const r = record.get('r');
      
      // Add or update source node
      const n_identt = n.properties.id || n.identity.toString();
      nodesMap.set(n_identt, { id: n_identt,
        label: n.properties.label,
        type: n.labels[0],
        ...n.properties
      });
      
      if(r && m) {
        // Add or update target node
        const m_identt = m.properties.id || m.identity.toString();
        nodesMap.set(m_identt, { id: m_identt,
          label: m.properties.label,
          type: m.labels[0],
          ...m.properties
        });

        // Add relationship as a link
        links.push({ source: n_identt,
          target: m_identt, 
          type: r.type,
          ...r.properties
        });
      } 
    });

    const nodes = Array.from(nodesMap.values());
    res.json({ nodes, links });

  } catch (error) {
    console.error("Error in /api/graph:", error);
    res.status(500).json({ message: error.message || "Internal Server Error" });
  } finally {
    if (session) {
      try {
        await session.close();
      } catch (closeError) {
        console.error("Error closing Neo4j session:", closeError);
      }
    }
  }
});

// --- START SERVER ---
app.listen(PORT, () => {
  console.log(`Server is running at http://localhost:${PORT}`);
});