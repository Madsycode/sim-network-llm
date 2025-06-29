// === Cleanup ===
//MATCH (n) DETACH DELETE n;

// === 5. Create Frequencies ===
CREATE (freq1:Band {
  id: 'n78',
  value_GHz: 3.5,
  label: 'Band n78',
  uplink_MHz: 3420,
  downlink_MHz: 3500,
}),
(freq2:Band {
  id: 'n258',
  value_GHz: 26,
  label: 'Band n258',
  uplink_MHz: 24250,
  downlink_MHz: 24500,
});

// === 6. Create Channels ===
CREATE (chan1:Channel {
  id: 'CH100',
  label: 'Chan-100',
  bandwidth_MHz: 100
}),
(chan2:Channel {
  id: 'CH200',
  label: 'Chan-200',
  bandwidth_MHz: 400
});

// === 7. Create Backhaul Links (Expanded) ===
CREATE (bh1:Backhaul {
  id: 'BH01',
  label: 'Backhaul Fiber',
  latency_ms: 2,
  capacity_mbps: 10000,
  technology: 'Fiber Optic'
}),
(bh2:Backhaul {
  id: 'BH02',
  label: 'Backhaul Microwave',
  latency_ms: 5,
  capacity_mbps: 5000,
  technology: 'Microwave'
});

// === 8. Create Network Slices (Expanded) ===
CREATE (slice1:Slice {
  id: 'eMBB-1',
  label: 'Slice eMBB'
}),
(slice2:Slice {
  id: 'URLLC-1',
  label: 'Slice URLLC'
}),
(slice3:Slice {
  id: 'mMTC-1',
  label: 'Slice mMTC'
});

// === 9. Create QoS Policies (Expanded) ===
CREATE (qos1:QoS {
  id: 'QoS1',
  label: 'Premium Video',
  priority: 1,
  latency_target_ms: 5,
  throughput_target_mbps: 1000
}),
(qos2:QoS {
  id: 'QoS2',
  label: 'Critical Comms QoS',
  priority: 0,
  latency_target_ms: 1,
  throughput_target_mbps: 500
}),
(qos3:QoS {
  id: 'QoS3',
  label: 'IoT Basic QoS',
  priority: 5,
  latency_target_ms: 50,
  throughput_target_mbps: 1
});

// === 10. Create Network Functions ===
CREATE (amf:NetworkFunction {
  id: 'AMF01',
  label: 'AMF',
  status: "active",
  function: 'Access and Mobility Management Function'
}),
(smf:NetworkFunction {
  id: 'SMF01',
  label: 'SMF',
  status: "active",
  function: 'Session Management Function'
}),
(upf:NetworkFunction {
  id: 'UPF01',
  label: 'UPF',
  status: "active",
  function: 'User Plane Function'
});

// === 11. Create Data Networks ===
CREATE (dn:DataNetwork {
  id: 'DN-Internet',
  label: 'Internet'
});

// === 14. Create Alarms ===
CREATE (alarm1:Alarm {
  id: 'ALM559',
  label: 'High-Temp Alarm',
  status: 'active',
  severity: 'critical',
  description: 'High-Temp detected!',
  timestamp: '2025-06-18T10:00:00Z'
});

// === 15. Create Services ===
CREATE (service1:Service {
  id: 'SVC-VIDEO',
  label: '4K Video Stream',
  description: 'Streaming'
}),
(service2:Service {
  id: 'SVC-V2X',
  label: 'Autonomous Driving Data',
  description: 'Real-time Control'
}),
(service3:Service {
  id: 'SVC-IOT',
  label: 'Sensor Data Upload',
  description: 'Background Data'
});


// ===================================
// === EXPANDED RELATIONSHIPS      ===
// ===================================

// === gNodeB Relationships ===
MATCH (bs:gNodeB {id: 'gNodeB-1'}), (freq:Band {id: 'n78'}) CREATE (bs)-[:OPERATES_ON]->(freq);
MATCH (bs:gNodeB {id: 'gNodeB-2'}), (freq:Band {id: 'n258'}) CREATE (bs)-[:OPERATES_ON]->(freq);
MATCH (bs:gNodeB {id: 'gNodeB-3'}), (freq:Band {id: 'n78'}) CREATE (bs)-[:OPERATES_ON]->(freq);

MATCH (bs:gNodeB {id: 'gNodeB-1'}), (bh:Backhaul {id: 'BH01'}) CREATE (bs)-[:HAS_BACKHAUL]->(bh);
MATCH (bs:gNodeB {id: 'gNodeB-2'}), (bh:Backhaul {id: 'BH02'}) CREATE (bs)-[:HAS_BACKHAUL]->(bh);
MATCH (bs:gNodeB {id: 'gNodeB-3'}), (bh:Backhaul {id: 'BH01'}) CREATE (bs)-[:HAS_BACKHAUL]->(bh);

MATCH (agv:AGV {id: 'AGV-1001'}), (slice:Slice {id: 'eMBB-1'}) CREATE (agv)-[:ASSIGNED_TO]->(slice);
MATCH (agv:AGV {id: 'AGV-1002'}), (slice:Slice {id: 'mMTC-1'}) CREATE (agv)-[:ASSIGNED_TO]->(slice);
MATCH (agv:AGV {id: 'AGV-1004'}), (slice:Slice {id: 'URLLC-1'}) CREATE (agv)-[:ASSIGNED_TO]->(slice);

// === Slice -> QoS & gNodeB Support ===
MATCH (slice:Slice {id: 'eMBB-1'}), (qos:QoS {id: 'QoS1'}) CREATE (slice)-[:ENFORCES]->(qos);
MATCH (slice:Slice {id: 'URLLC-1'}), (qos:QoS {id: 'QoS2'}) CREATE (slice)-[:ENFORCES]->(qos);
MATCH (slice:Slice {id: 'mMTC-1'}), (qos:QoS {id: 'QoS3'}) CREATE (slice)-[:ENFORCES]->(qos);

MATCH (bs:gNodeB {id: 'gNodeB-1'}), (slice:Slice {id: 'eMBB-1'}) CREATE (bs)-[:SUPPORTS]->(slice);
MATCH (bs:gNodeB), (slice:Slice {id: 'mMTC-1'}) CREATE (bs)-[:SUPPORTS]->(slice); // All BS support mMTC
MATCH (bs:gNodeB {id: 'gNodeB-2'}), (slice:Slice {id: 'URLLC-1'}) CREATE (bs)-[:SUPPORTS]->(slice);

// --- NEW: Service Requirements and Policy ---
MATCH (s:Service {id: 'SVC-STREAMING'}), (q:QoS {id: 'QoS1'}) CREATE (s)-[:REQUIRES_QOS]->(q);
MATCH (s:Service {id: 'SVC-SELFDRIVE'}), (q:QoS {id: 'QoS2'}) CREATE (s)-[:REQUIRES_QOS]->(q);
MATCH (s:Service {id: 'SVC-IOT-COM'}), (q:QoS {id: 'QoS3'}) CREATE (s)-[:REQUIRES_QOS]->(q);

// ===================================
// === NEW RELATIONSHIP TYPES      ===
// ===================================

// --- Linking RAN to Core Network ---
MATCH (bs:gNodeB), (amf:NetworkFunction {id: 'AMF01'}) CREATE (bs)-[:CONNECTS_TO_CORE {interface:'N2'}]->(amf);

// --- Core Network Internal Routing ---
MATCH (amf:NetworkFunction {id: 'AMF01'}), (smf:NetworkFunction {id: 'SMF01'}) 
CREATE (amf)-[:ROUTES_TO {interface:'N11'}]->(smf);
MATCH (smf:NetworkFunction {id: 'SMF01'}), (upf:NetworkFunction {id: 'UPF01'})
CREATE (smf)-[:CONTROLS {interface:'N4'}]->(upf);

// --- User Plane Path to Data Network ---
MATCH (upf:NetworkFunction {id: 'UPF01'}), (dn:DataNetwork {id: 'DN-Internet'})
CREATE (upf)-[:CONNECTS_TO_DN {interface:'N6'}]->(dn);

// --- AGV Session in Core Network ---
MATCH (agv:AGV), (smf:NetworkFunction {id: 'SMF01'}) WHERE agv.id IN 
['AGV-1001', 'AGV-1002', 'AGV-1003', 'AGV-1004', 'AGV-1005']
CREATE (agv)-[:HAS_SESSION_WITH]->(smf);

// --- Connect AGV Channels ---
MATCH (agv:AGV {id: 'AGV-1001'}), (chan:Channel {id: 'CH100'}) CREATE (agv)-[:USES]->(chan);
MATCH (agv:AGV {id: 'AGV-1002'}), (chan:Channel {id: 'CH200'}) CREATE (agv)-[:USES]->(chan);

// --- Operational Alarms ---
MATCH (bs:gNodeB {id: 'gNodeB-3'}), (alarm:Alarm {id: 'ALM559'}) CREATE (bs)-[:RAISES_ALARM]->(alarm);
