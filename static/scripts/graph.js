document.addEventListener('DOMContentLoaded', () => {
    const graphContainer = document.getElementById('graph-container');

    // Fetch and display knowledge graph
    fetch('/api/graph').then(response => response.json())
        .then(graph => displayGraph(graph));

    // Display knowledge graph
    function displayGraph(graph) {
        // Validate graph data
        if (!graph || !graph.nodes || !graph.links) {
            console.error("Invalid graph data!");
            return;
        }

        // Clear elements
        const svg = d3.select("svg");
        svg.selectAll("*").remove(); 
        
        // Zoomable elements
        const container = svg.append("g");
        const tooltip = d3.select("#tooltip");
        
        // Get the container dimensions 
        const nodeRadius = 40;
        const width = graphContainer.clientWidth;
        const height = graphContainer.clientHeight;
        const colorScale = d3.scaleOrdinal(d3.schemeCategory10);

        const nodeShapes = {
            QoS: d3.symbolSquare,
            Cell: d3.symbolSquare,
            Channel: d3.symbolSquare,
            Location: d3.symbolSquare,
            Frequency: d3.symbolSquare,
        };

        const symbolGenerator = d3.symbol().size(d => {
            let radius = nodeRadius;
            if(d.type === 'gNodeB') 
                radius = nodeRadius * 1.5;
            else if(d.type === 'UE')
                radius = nodeRadius * 1.2;
            return Math.PI * radius * radius;
        }).type(d => nodeShapes[d.type] || d3.symbolCircle); 

        // Initialize the simulation
        const simulation = d3.forceSimulation(graph.nodes)
            .force("link", d3.forceLink(graph.links).id(d => d.id).distance(400))
            .force("charge", d3.forceManyBody().strength(-500))
            .force("center", d3.forceCenter(width / 2, height / 2));

        // Arrowheads for links
        svg.append("defs").append("marker")
            .attr("id", "arrowhead")
            .attr("viewBox", "-0 -5 10 10")
            .attr("refX", 10) 
            .attr("refY", 0)
            .attr("orient", "auto")
            .attr("markerWidth", 5)
            .attr("markerHeight", 5)
            .append("path")
            .attr("d", "M0,-5L10,0L0,5")
            .attr("fill", "#999");

        // Draw links (lines) 
        const link = container.append("g")
            .attr("stroke", "#666")
            .selectAll("line")
            .data(graph.links)
            .join("line")
            .attr("stroke-width", 2)
            .attr("marker-end", "url(#arrowhead)");

        // Draw link labels (text on links)
        const linkLabel = container.append("g")
            .attr("class", "link-labels")
            .selectAll("text")
            .data(graph.links)
            .join("text")
            .text(d => d.type)
            .attr("font-size", 14)
            .attr("fill", "#fff")
            .attr("text-anchor", "middle")     
            .attr("dominant-baseline", "central");      
        
        // Draw nodes (circles) 
        const node = container.append("g")
            .attr("stroke", "#fff")
            .attr("stroke-width", 3)
            .selectAll("path")
            .data(graph.nodes)
            .join("path")
            .attr("r", nodeRadius)
            .attr("d", symbolGenerator)
            .attr("fill", d => colorScale(d.type))
            .on("mouseover", function(event, d) {
                // Make the tooltip visible and start the transition
                tooltip.style("visibility", "visible")
                    .style("opacity", 1)
                    .style("transform", "translateY(0px)");
                
                // Dynamically create the tooltip content from node properties
                // We filter out D3-specific properties for a cleaner look
                const propertiesToShow = Object.entries(d).filter(([key, _]) => 
                    !['index', 'x', 'y', 'vx', 'vy', 'fx', 'fy'].includes(key)
                );

                let tooltipContent = propertiesToShow.map(([key, value]) => {
                    return `<div><span class="tooltip-key">${key.replace(/_/g, ' ')}:</span><span class="tooltip-value">${value}</span></div>`;
                }).join('');

                // If there are no properties to show, display the node ID
                if (tooltipContent.length === 0) {
                    tooltipContent = `<div><span class="tooltip-key">id:</span><span class="tooltip-value">${d.id}</span></div>`;
                }

                tooltip.html(tooltipContent);
            })
            .on("mousemove", function(event, d) {
                // Position the tooltip next to the cursor
                // event.pageX and event.pageY are the mouse coordinates relative to the document
                tooltip.style("top", (event.pageY + 15) + "px")
                    .style("left", (event.pageX + 15) + "px");
            })
            .on("mouseout", function(event, d) {
                // Hide the tooltip with a transition
                tooltip.style("opacity", 0)
                    .style("transform", "translateY(10px)");
                
                // Use a timeout to set visibility to hidden after the transition ends
                setTimeout(() => {
                    tooltip.style("visibility", "hidden");
                }, 200); // Should match the transition duration
            })
            .call(drag(simulation));

        // Draw node labels (text on nodes) 
        const nodeLabel = container.append("g")
            .selectAll("text")
            .data(graph.nodes)
            .join("text")
            .text(d => d.id)
            .attr("fill", "#fff")
            .attr("font-size", 14)
            .attr("text-anchor", "middle")       
            .attr("dominant-baseline", "central"); 

        // Update positions on each tick
        simulation.on("tick", () => {
            link.each(function(d) {
                const dx = d.target.x - d.source.x;
                const dy = d.target.y - d.source.y;
                const distance = Math.sqrt(dx * dx + dy * dy);
                if (distance === 0) return;

                // This places the arrow tip on the edge of the circle
                const targetX = d.target.x - (dx / distance) * nodeRadius;
                const targetY = d.target.y - (dy / distance) * nodeRadius;

                d3.select(this)
                    .attr("x1", d.source.x).attr("y1", d.source.y)
                    .attr("x2", targetX).attr("y2", targetY);
            });

            node
                .attr("transform", d => `translate(${d.x},${d.y})`);

            nodeLabel
                .attr("x", d => d.x)
                .attr("y", d => d.y);

            linkLabel
                .attr("x", d => (d.source.x + d.target.x) / 2)
                .attr("y", d => (d.source.y + d.target.y) / 2)
                .attr("transform", d => {
                    const x = (d.source.x + d.target.x) / 2;
                    const y = (d.source.y + d.target.y) / 2;
                    const angle = Math.atan2(d.target.y - d.source.y, d.target.x - d.source.x) * 180 / Math.PI;
                    return `rotate(${angle}, ${x}, ${y})`;
                });
        });

        // Dragging behavior for nodes
        function drag(simulation) {
            return d3.drag()
                .on("start", (event, d) => {
                    if (!event.active) simulation.alphaTarget(0.3).restart();
                    d.fx = d.x;
                    d.fy = d.y;
                })
                .on("drag", (event, d) => {
                    d.fx = event.x;
                    d.fy = event.y;
                })
                .on("end", (event, d) => {
                    if (!event.active) simulation.alphaTarget(0);
                    d.fx = null;
                    d.fy = null;
                });
        }

        // Zoom transform
        const zoom = d3.zoom().scaleExtent([0.1, 5])
        .on("zoom", (event) => {
            container.attr("transform", event.transform);
        });
        svg.call(zoom);
    }
});
