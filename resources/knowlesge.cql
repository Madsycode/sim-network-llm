// === Cleanup ===
MATCH (n) DETACH DELETE n;

// === 1. Create Base Stations (gNodeB) ===
CREATE (bs1:gNodeB {
  id: 'gNodeB1',
  label: 'gNodeB 01',
  capacity_mbps: 2000,
  status: 'active',
  vendor: 'Nokia',
  band: 'n78'
}),
(bs2:gNodeB {
  id: 'gNodeB2',
  label: 'gNodeB 02',
  capacity_mbps: 1500,
  status: 'active',
  vendor: 'Huawei',
  band: 'n258'
}),
(bs3:gNodeB {
  id: 'gNodeB3',
  label: 'gNodeB 03',
  capacity_mbps: 1800,
  status: 'maintenance', 
  vendor: 'Ericsson',
  band: 'n78'
});

// === 2. Create User Equipments ===
CREATE (ue1:UE {
  id: 'UE1001',
  label: 'UE Phone',
  imei: '358240051111110',
  os: 'Android',
  connected_since: '2025-06-17T12:00:00'
}),
(ue2:UE {
  id: 'UE1002',
  label: 'UE Sensor',
  imei: '867530900123456',
  os: 'RTOS',
  connected_since: '2025-06-17T12:05:00'
}),
(ue3:UE {
  id: 'UE1003',
  label: 'UE Tablet',
  imei: '358240052222222',
  os: 'iOS',
  connected_since: '2025-06-17T13:10:00'
}),
(ue4:UE {
  id: 'UE1004',
  label: 'UE Vehicle',
  imei: '867530900789012',
  os: 'QNX',
  connected_since: '2025-06-17T14:00:00'
});

// === 3. Create Cells (Expanded) ===
CREATE (cell1:Cell {
  id: 'CellA',
  label: 'Cell Downtown Macro',
  frequency_band: 'n78',
  cell_type: 'macro'
}),
(cell2:Cell {
  id: 'CellB',
  label: 'Cell Suburbs Small',
  frequency_band: 'n258',
  cell_type: 'small'
}),
(cell3:Cell {
  id: 'CellC',
  label: 'Cell Industrial',
  frequency_band: 'n78',
  cell_type: 'macro'
});

// === 4. Create Sectors (Expanded) ===
CREATE (sector1:Sector {
  id: 'SectorA1',
  label: 'Sector 0°',
  azimuth_deg: 0,
  antenna_gain_dBi: 18
}),
(sector2:Sector {
  id: 'SectorA2',
  label: 'Sector 120°',
  azimuth_deg: 120,
  antenna_gain_dBi: 18
}),
(sector3:Sector {
  id: 'SectorC1',
  label: 'Sector 60°',
  azimuth_deg: 60,
  antenna_gain_dBi: 17.5
});

// === 5. Create Frequencies ===
CREATE (freq1:Frequency {
  id: 'n78',
  value_GHz: 3.5,
  label: 'Frequency n78',
  uplink_freq: '3420-3500 MHz',
  downlink_freq: '3500-3600 MHz'
}),
(freq2:Frequency {
  id: 'n258',
  value_GHz: 26,
  label: 'Frequency n258',
  uplink_freq: '24250-24500 MHz',
  downlink_freq: '24500-27500 MHz'
});

// === 6. Create Channels ===
CREATE (chan1:Channel {
  id: 'CH100',
  label: 'Channel-100',
  bandwidth_MHz: 100
}),
(chan2:Channel {
  id: 'CH200',
  label: 'Channel-200',
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
  function: 'Access and Mobility Management Function'
}),
(smf:NetworkFunction {
  id: 'SMF01',
  label: 'SMF',
  function: 'Session Management Function'
}),
(upf:NetworkFunction {
  id: 'UPF01',
  label: 'UPF',
  function: 'User Plane Function'
});

// === 11. Create Data Networks ===
CREATE (dn:DataNetwork {
  id: 'DN-Internet',
  label: 'Internet'
});

// === 12. Create Subscribers ===
CREATE (sub1:Subscriber {
  id: 'SUB9001',
  label: 'Alice',
  plan: 'Premium Unlimited'
}),
(sub2:Subscriber {
  id: 'SUB9002',
  label: 'City Logistics Inc.',
  plan: 'IoT Fleet'
});

// === 13. Create Locations ===
CREATE (loc1:Location {
  id: 'LOC_TOWER_A',
  label: 'Tower A',
  latitude: 40.7128,
  longitude: -74.0060
}),
(loc2:Location {
  id: 'LOC_TOWER_B',
  label: 'Tower B',
  latitude: 40.7580,
  longitude: -73.9855
}),
(loc3:Location {
  id: 'LOC_INDUSTRIAL_PARK',
  label: 'Industrial Park',
  latitude: 40.6500,
  longitude: -73.9496
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

// === gNodeB -> Cell -> Sector ===
MATCH (bs:gNodeB {id: 'gNodeB1'}), (cell:Cell {id: 'CellA'}) CREATE (bs)-[:HAS_CELL]->(cell);
MATCH (bs:gNodeB {id: 'gNodeB2'}), (cell:Cell {id: 'CellB'}) CREATE (bs)-[:HAS_CELL]->(cell);
MATCH (bs:gNodeB {id: 'gNodeB3'}), (cell:Cell {id: 'CellC'}) CREATE (bs)-[:HAS_CELL]->(cell);

MATCH (cell:Cell {id: 'CellA'}), (sector:Sector {id: 'SectorA1'}) CREATE (cell)-[:HAS_SECTOR]->(sector);
MATCH (cell:Cell {id: 'CellA'}), (sector:Sector {id: 'SectorA2'}) CREATE (cell)-[:HAS_SECTOR]->(sector);
MATCH (cell:Cell {id: 'CellC'}), (sector:Sector {id: 'SectorC1'}) CREATE (cell)-[:HAS_SECTOR]->(sector);

// === gNodeB Relationships ===
MATCH (bs:gNodeB {id: 'gNodeB1'}), (freq:Frequency {id: 'n78'}) CREATE (bs)-[:OPERATES_ON]->(freq);
MATCH (bs:gNodeB {id: 'gNodeB2'}), (freq:Frequency {id: 'n258'}) CREATE (bs)-[:OPERATES_ON]->(freq);
MATCH (bs:gNodeB {id: 'gNodeB3'}), (freq:Frequency {id: 'n78'}) CREATE (bs)-[:OPERATES_ON]->(freq);

MATCH (bs:gNodeB {id: 'gNodeB1'}), (bh:Backhaul {id: 'BH01'}) CREATE (bs)-[:HAS_BACKHAUL]->(bh);
MATCH (bs:gNodeB {id: 'gNodeB2'}), (bh:Backhaul {id: 'BH02'}) CREATE (bs)-[:HAS_BACKHAUL]->(bh);
MATCH (bs:gNodeB {id: 'gNodeB3'}), (bh:Backhaul {id: 'BH01'}) CREATE (bs)-[:HAS_BACKHAUL]->(bh);

MATCH (bs1:gNodeB {id: 'gNodeB1'}), (bs2:gNodeB {id: 'gNodeB2'}) CREATE (bs1)-[:PEERS_WITH {type:'Xn'}]->(bs2);
MATCH (bs1:gNodeB {id: 'gNodeB1'}), (bs3:gNodeB {id: 'gNodeB3'}) CREATE (bs1)-[:PEERS_WITH {type:'Xn'}]->(bs3);

// === UE Connections and Assignments ===
MATCH (ue:UE {id: 'UE1001'}), (cell:Cell {id: 'CellA'}) CREATE (ue)-[:CONNECTED_TO]->(cell);
MATCH (ue:UE {id: 'UE1002'}), (cell:Cell {id: 'CellC'}) CREATE (ue)-[:CONNECTED_TO]->(cell);
MATCH (ue:UE {id: 'UE1003'}), (cell:Cell {id: 'CellA'}) CREATE (ue)-[:CONNECTED_TO]->(cell);
MATCH (ue:UE {id: 'UE1004'}), (cell:Cell {id: 'CellB'}) CREATE (ue)-[:CONNECTED_TO]->(cell);

MATCH (ue:UE {id: 'UE1001'}), (slice:Slice {id: 'eMBB-1'}) CREATE (ue)-[:ASSIGNED_TO]->(slice);
MATCH (ue:UE {id: 'UE1002'}), (slice:Slice {id: 'mMTC-1'}) CREATE (ue)-[:ASSIGNED_TO]->(slice);
MATCH (ue:UE {id: 'UE1004'}), (slice:Slice {id: 'URLLC-1'}) CREATE (ue)-[:ASSIGNED_TO]->(slice);

// === Slice -> QoS & gNodeB Support ===
MATCH (slice:Slice {id: 'eMBB-1'}), (qos:QoS {id: 'QoS1'}) CREATE (slice)-[:ENFORCES]->(qos);
MATCH (slice:Slice {id: 'URLLC-1'}), (qos:QoS {id: 'QoS2'}) CREATE (slice)-[:ENFORCES]->(qos);
MATCH (slice:Slice {id: 'mMTC-1'}), (qos:QoS {id: 'QoS3'}) CREATE (slice)-[:ENFORCES]->(qos);

MATCH (bs:gNodeB {id: 'gNodeB1'}), (slice:Slice {id: 'eMBB-1'}) CREATE (bs)-[:SUPPORTS]->(slice);
MATCH (bs:gNodeB), (slice:Slice {id: 'mMTC-1'}) CREATE (bs)-[:SUPPORTS]->(slice); // All BS support mMTC
MATCH (bs:gNodeB {id: 'gNodeB2'}), (slice:Slice {id: 'URLLC-1'}) CREATE (bs)-[:SUPPORTS]->(slice);

// === UE Consuming Services ===
MATCH (ue:UE {id: 'UE1001'}), (s:Service {id: 'SVC-VIDEO'})
CREATE (ue)-[:USES_SERVICE {startTime: '2025-06-17T12:01:00', data_consumed_GB: 2.5}]->(s);
MATCH (ue:UE {id: 'UE1002'}), (s:Service {id: 'SVC-IOT'})
CREATE (ue)-[:USES_SERVICE {startTime: '2025-06-17T12:05:30', data_consumed_GB: 0.01}]->(s);
MATCH (ue:UE {id: 'UE1004'}), (s:Service {id: 'SVC-AUTODRIVE'})
CREATE (ue)-[:USES_SERVICE {startTime: '2025-06-17T14:00:15', data_consumed_GB: 1.2}]->(s);

// --- NEW: Service Requirements and Policy ---
MATCH (s:Service {id: 'SVC-VIDEO'}), (q:QoS {id: 'QoS1'}) CREATE (s)-[:REQUIRES_QOS]->(q);
MATCH (s:Service {id: 'SVC-AUTODRIVE'}), (q:QoS {id: 'QoS2'}) CREATE (s)-[:REQUIRES_QOS]->(q);
MATCH (s:Service {id: 'SVC-IOT'}), (q:QoS {id: 'QoS3'}) CREATE (s)-[:REQUIRES_QOS]->(q);

// ===================================
// === NEW RELATIONSHIP TYPES      ===
// ===================================

// --- Subscriber and User Ownership ---
MATCH (sub:Subscriber {id: 'SUB9001'}), (ue:UE) WHERE ue.id IN ['UE1001', 'UE1003'] CREATE (sub)-[:OWNS]->(ue);
MATCH (sub:Subscriber {id: 'SUB9002'}), (ue:UE) WHERE ue.id IN ['UE1002', 'UE1004'] CREATE (sub)-[:OWNS]->(ue);

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

// --- UE Session in Core Network ---
MATCH (ue:UE), (smf:NetworkFunction {id: 'SMF01'}) WHERE ue.id IN ['UE1001', 'UE1003', 'UE1004']
CREATE (ue)-[:HAS_SESSION_WITH]->(smf);

// --- Connect UE Channels ---
MATCH (ue:UE {id: 'UE1001'}), (chan:Channel {id: 'CH100'}) CREATE (ue)-[:USES]->(chan);
MATCH (ue:UE {id: 'UE1002'}), (chan:Channel {id: 'CH200'}) CREATE (ue)-[:USES]->(chan);

// --- Physical Location of Base Stations ---
MATCH (bs:gNodeB {id: 'gNodeB1'}), (loc:Location {id: 'LOC_TOWER_A'}) CREATE (bs)-[:LOCATED_AT]->(loc);
MATCH (bs:gNodeB {id: 'gNodeB2'}), (loc:Location {id: 'LOC_TOWER_B'}) CREATE (bs)-[:LOCATED_AT]->(loc);
MATCH (bs:gNodeB {id: 'gNodeB3'}), (loc:Location {id: 'LOC_INDUSTRIAL_PARK'}) CREATE (bs)-[:LOCATED_AT]->(loc);

// --- Operational Alarms ---
MATCH (bs:gNodeB {id: 'gNodeB3'}), (alarm:Alarm {id: 'ALM559'})
CREATE (bs)-[:RAISES_ALARM]->(alarm);

// --- Performance Metrics ---
MATCH (ue:UE {id: 'UE1001'}), (cell:Cell {id: 'CellA'})
CREATE (ue)-[:MEASURES_PERFORMANCE {RSRP_dBm: -85, SINR_dB: 20, throughput_kbps: 85000}]->(cell);

MATCH (ue:UE {id: 'UE1002'}), (cell:Cell {id: 'CellC'})
CREATE (ue)-[:MEASURES_PERFORMANCE {RSRP_dBm: -110, SINR_dB: 5, throughput_kbps: 950}]->(cell);