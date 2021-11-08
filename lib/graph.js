export class Graph {
    constructor(label, opts = {}) {
        this._isDirected = true;
        this._isMultigraph = false;
        this._isCompound = false;
        /* Number of nodes in the graph. */
        this._nodeCount = 0;
        /* Number of edges in the graph. */
        this._edgeCount = 0;
        this._nodes = new Map();
        this._in = new Map();
        this._out = new Map();
        this._preds = new Map();
        this._sucs = new Map();
        this._edges = new Map();
        this._id = 0;
        this._label = label;
        if (opts.directed !== undefined) {
            this._isDirected = opts.directed;
        }
        if (opts.multigraph !== undefined) {
            this._isMultigraph = opts.multigraph;
        }
        if (opts.compound !== undefined) {
            this._isCompound = opts.compound;
        }
        if (this._isCompound) {
            this._parent = new Map();
            this._children = new Map([[null, new Set()]]);
        }
    }
    _getId() {
        const id = this._id.toString(16);
        this._id++;
        return id;
    }
    _makeEdgeId({ source, target, tag }) {
        if (tag === undefined) {
            return `${source}:${target}`;
        }
        else {
            return `${source}:${target}:${tag}`;
        }
    }
    _parseEdgeId(edgeId) {
        const match = Graph._edgeIdPattern.exec(edgeId);
        if (match === null) {
            throw new Error("invalid edge id");
        }
        const [_, source, target, tag] = match;
        if (tag === undefined && this._isMultigraph) {
            throw new Error("multigraph edge ids must have a tag");
        }
        return { source, target, tag };
    }
    isDirected() {
        return this._isDirected;
    }
    isMultigraph() {
        return this._isMultigraph;
    }
    isCompound() {
        return this._isCompound;
    }
    graph() {
        return this._label;
    }
    setGraph(label) {
        this._label = label;
    }
    nodeCount() {
        return this._nodeCount;
    }
    nodes() {
        return this._nodes.keys();
    }
    *sources() {
        for (const nodeId of this.nodes()) {
            const edges = this._in.get(nodeId);
            if (edges.size === 0) {
                yield nodeId;
            }
        }
    }
    *sinks() {
        for (const nodeId of this.nodes()) {
            const edges = this._out.get(nodeId);
            if (edges.size === 0) {
                yield nodeId;
            }
        }
    }
    addNode(label) {
        const nodeId = this._getId();
        this._addNode(nodeId, label);
        return nodeId;
    }
    _addNode(nodeId, label) {
        this._nodes.set(nodeId, label);
        if (this._isCompound) {
            this._parent.set(nodeId, null);
            this._children.set(nodeId, new Set());
            this._children.get(null).add(nodeId);
        }
        this._in.set(nodeId, new Set());
        this._preds.set(nodeId, new Map());
        this._out.set(nodeId, new Set());
        this._sucs.set(nodeId, new Map());
        this._nodeCount++;
    }
    setNode(nodeId, label) {
        if (this._nodes.has(nodeId)) {
            this._nodes.set(nodeId, label);
        }
        else {
            throw new Error("node id not found");
        }
    }
    node(nodeId) {
        if (this._nodes.has(nodeId)) {
            return this._nodes.get(nodeId);
        }
        else {
            throw new Error("node id not found");
        }
    }
    hasNode(nodeId) {
        return this._nodes.has(nodeId);
    }
    removeNode(nodeId) {
        if (this._nodes.has(nodeId)) {
            this._nodes.delete(nodeId);
            if (this._isCompound) {
                this._removeFromParentsChildList(nodeId);
                this._parent.delete(nodeId);
                for (const child of this._children.get(nodeId)) {
                    this.setParent(child, null);
                }
                this._children.delete(nodeId);
            }
            for (const edge of this._in.get(nodeId)) {
                this.removeEdge(edge);
            }
            this._in.delete(nodeId);
            this._preds.delete(nodeId);
            for (const edge of this._out.get(nodeId)) {
                this.removeEdge(edge);
            }
            this._out.delete(nodeId);
            this._sucs.delete(nodeId);
            this._nodeCount--;
        }
    }
    setParent(nodeId, parent) {
        if (!this._isCompound) {
            throw new Error("Cannot set parent in a non-compound graph");
        }
        else if (parent !== null && !this.hasNode(parent)) {
            throw new Error("node id not found");
        }
        else if (!this.hasNode(nodeId)) {
            throw new Error("node id not found");
        }
        for (let ancestor = parent; ancestor !== null; ancestor = this.parent(ancestor)) {
            if (ancestor === nodeId) {
                throw new Error(`Setting ${parent} as parent of ${nodeId} would create a cycle`);
            }
        }
        this._removeFromParentsChildList(nodeId);
        this._parent.set(nodeId, parent);
        this._children.get(parent).add(nodeId);
    }
    _removeFromParentsChildList(nodeId) {
        const parent = this.parent(nodeId);
        this._children.get(parent).delete(nodeId);
    }
    parent(nodeId) {
        if (!this._isCompound) {
            throw new Error("Cannot get parent in a non-compound graph");
        }
        const parent = this._parent.get(nodeId);
        if (parent === undefined) {
            throw new Error("node id not found");
        }
        return parent;
    }
    children(nodeId) {
        if (!this._isCompound) {
            throw new Error("Cannot iterate children in a non-compound graph");
        }
        const children = this._children.get(nodeId);
        if (children === undefined) {
            throw new Error("node id not found");
        }
        return children;
    }
    predecessors(nodeId) {
        const predecessors = this._preds.get(nodeId);
        if (predecessors === undefined) {
            throw new Error("ndoe id not found");
        }
        return predecessors.keys();
    }
    successors(nodeId) {
        const successors = this._sucs.get(nodeId);
        if (successors === undefined) {
            throw new Error("ndoe id not found");
        }
        return successors.keys();
    }
    neighbors(nodeId) {
        const neighbors = new Set();
        for (const predecessor of this.predecessors(nodeId)) {
            neighbors.add(predecessor);
        }
        for (const successor of this.successors(nodeId)) {
            neighbors.add(successor);
        }
        return neighbors;
    }
    isLeaf(nodeId) {
        const neighbors = new Set(this.successors(nodeId));
        if (!this._isDirected) {
            for (const predecessor of this.predecessors(nodeId)) {
                neighbors.add(predecessor);
            }
        }
        return neighbors.size === 0;
    }
    filterNodes(filter) {
        const graph = new Graph(this._label, {
            directed: this._isDirected,
            multigraph: this._isMultigraph,
            compound: this._isCompound,
        });
        for (const [nodeId, label] of this._nodes) {
            if (filter(nodeId, label)) {
                graph.setNode(nodeId, label);
            }
        }
        for (const [edgeId, label] of this._edges) {
            const edge = this._parseEdgeId(edgeId);
            if (graph.hasNode(edge.source) && graph.hasNode(edge.target)) {
                graph._addEdge(edge, label);
            }
        }
        const parents = new Map();
        const findParent = (nodeId) => {
            const parent = this.parent(nodeId);
            if (parent === null || graph.hasNode(parent)) {
                parents.set(nodeId, parent);
                return parent;
            }
            else if (parents.has(parent)) {
                return parents.get(parent);
            }
            else {
                return findParent(parent);
            }
        };
        if (this._isCompound) {
            for (const id of graph.nodes()) {
                graph.setParent(id, findParent(id));
            }
        }
        return graph;
    }
    edgeCount() {
        return this._edgeCount;
    }
    edges() {
        return this._edges.keys();
    }
    addEdge(source, target, label) {
        const edge = this._isMultigraph
            ? { source, target, tag: this._getId() }
            : { source, target };
        return this._addEdge(edge, label);
    }
    _addEdge(edge, label) {
        if (!this.hasNode(edge.source)) {
            throw new Error("source node does not exist");
        }
        else if (!this.hasNode(edge.target)) {
            throw new Error("target node does not exist");
        }
        else if (this._isMultigraph && edge.tag === undefined) {
            throw new Error("multigraph edge ids must have tags");
        }
        else if (!this._isMultigraph && edge.tag !== undefined) {
            throw new Error("only multigraph edges can have tags");
        }
        const edgeId = this._makeEdgeId(edge);
        if (this._isMultigraph || !this._edges.has(edgeId)) {
            incrementOrInitEntry(this._preds.get(edge.target), edge.source);
            incrementOrInitEntry(this._sucs.get(edge.source), edge.target);
            this._in.get(edge.target).add(edgeId);
            this._out.get(edge.source).add(edgeId);
            this._edgeCount++;
        }
        this._edges.set(edgeId, label);
        return edgeId;
    }
    setEdge(edgeId, label) {
        if (this._edges.has(edgeId)) {
            this._edges.set(edgeId, label);
        }
        else {
            throw new Error("edge id not found");
        }
    }
    addPath(path, label) {
        path.reduce((source, target) => {
            this.addEdge(source, target, label);
            return target;
        });
    }
    edge(edgeId) {
        if (this._edges.has(edgeId)) {
            return this._edges.get(edgeId);
        }
        else {
            throw new Error("edge id not found");
        }
    }
    hasEdge(edgeId) {
        return this._edges.has(edgeId);
    }
    removeEdge(edgeId) {
        if (this._edges.has(edgeId)) {
            const { source, target } = this._parseEdgeId(edgeId);
            this._edges.delete(edgeId);
            decrementOrRemoveEntry(this._preds.get(target), source);
            decrementOrRemoveEntry(this._sucs.get(source), target);
            this._in.get(target).delete(edgeId);
            this._out.get(source).delete(edgeId);
            this._edgeCount--;
        }
    }
    *inEdges(target, source) {
        const incoming = this._in.get(target);
        if (incoming === undefined) {
            throw new Error("target id not found");
        }
        if (source === undefined) {
            for (const edgeId of incoming) {
                yield edgeId;
            }
        }
        else {
            const outgoing = this._out.get(source);
            if (outgoing === undefined) {
                throw new Error("source id not found");
            }
            for (const edgeId of incoming) {
                if (outgoing.has(edgeId)) {
                    yield edgeId;
                }
            }
        }
    }
    *outEdges(source, target) {
        const outgoing = this._out.get(source);
        if (outgoing === undefined) {
            throw new Error("source id not found");
        }
        if (target === undefined) {
            for (const edgeId of outgoing) {
                yield edgeId;
            }
        }
        else {
            const incoming = this._in.get(target);
            if (incoming === undefined) {
                throw new Error("target id not found");
            }
            for (const edgeId of outgoing) {
                if (incoming.has(edgeId)) {
                    yield edgeId;
                }
            }
        }
    }
    *nodeEdges(nodeId) {
        for (const edgeId of this.inEdges(nodeId)) {
            yield edgeId;
        }
        for (const edgeId of this.outEdges(nodeId)) {
            yield edgeId;
        }
    }
}
Graph._edgeIdPattern = /^([0-9a-f]+):([0-9a-f]+)(?:([0-9a-f]+))$/;
function incrementOrInitEntry(map, key) {
    const value = map.get(key);
    if (value === undefined) {
        map.set(key, 1);
    }
    else {
        map.set(key, value + 1);
    }
}
function decrementOrRemoveEntry(map, key) {
    const value = map.get(key);
    if (value === undefined) {
        throw new Error("key not found in map");
    }
    else if (value === 1) {
        map.delete(key);
    }
    else {
        map.set(key, value - 1);
    }
}
