export interface GraphOptions {
	directed?: boolean | undefined // default: true.
	multigraph?: boolean | undefined // default: false.
	compound?: boolean | undefined // default: false.
}

export interface EdgeObject {
	source: string
	target: string
	tag?: string
}

type NodeId = string
type EdgeId = string

export class Graph<GraphLabel, NodeLabel, EdgeLabel> {
	private _isDirected: boolean = true
	private _isMultigraph: boolean = false
	private _isCompound: boolean = false

	/* Number of nodes in the graph. */
	private _nodeCount = 0

	/* Number of edges in the graph. */
	private _edgeCount = 0

	private _nodes = new Map<NodeId, NodeLabel>()

	private _in = new Map<NodeId, Set<string>>()

	private _out = new Map<NodeId, Set<string>>()

	private _preds = new Map<NodeId, Map<NodeId, number>>()

	private _sucs = new Map<NodeId, Map<NodeId, number>>()

	private _edges = new Map<EdgeId, EdgeLabel>()

	private _parent?: Map<NodeId, NodeId | null>

	private _children?: Map<NodeId | null, Set<NodeId>>

	private _id: number = 0

	private _label: GraphLabel

	private static _edgeIdPattern = /^([0-9a-f]+):([0-9a-f]+)(?:([0-9a-f]+))$/

	constructor(label: GraphLabel, opts: GraphOptions = {}) {
		this._label = label

		if (opts.directed !== undefined) {
			this._isDirected = opts.directed
		}

		if (opts.multigraph !== undefined) {
			this._isMultigraph = opts.multigraph
		}

		if (opts.compound !== undefined) {
			this._isCompound = opts.compound
		}

		if (this._isCompound) {
			this._parent = new Map()
			this._children = new Map([[null, new Set()]])
		}
	}

	private _getId(): string {
		const id = this._id.toString(16)
		this._id++
		return id
	}

	private _makeEdgeId({ source, target, tag }: EdgeObject): EdgeId {
		if (tag === undefined) {
			return `${source}:${target}`
		} else {
			return `${source}:${target}:${tag}`
		}
	}

	private _parseEdgeId(edgeId: string): EdgeObject {
		const match = Graph._edgeIdPattern.exec(edgeId)
		if (match === null) {
			throw new Error("invalid edge id")
		}

		const [_, source, target, tag] = match
		if (tag === undefined && this._isMultigraph) {
			throw new Error("multigraph edge ids must have a tag")
		}

		return { source, target, tag }
	}

	isDirected(): boolean {
		return this._isDirected
	}

	isMultigraph(): boolean {
		return this._isMultigraph
	}

	isCompound(): boolean {
		return this._isCompound
	}

	graph(): GraphLabel {
		return this._label
	}

	setGraph(label: GraphLabel) {
		this._label = label
	}

	nodeCount(): number {
		return this._nodeCount
	}

	nodes(): Iterable<NodeId> {
		return this._nodes.keys()
	}

	*sources(): Iterable<NodeId> {
		for (const nodeId of this.nodes()) {
			const edges = this._in.get(nodeId)!
			if (edges.size === 0) {
				yield nodeId
			}
		}
	}

	*sinks(): Iterable<NodeId> {
		for (const nodeId of this.nodes()) {
			const edges = this._out.get(nodeId)!
			if (edges.size === 0) {
				yield nodeId
			}
		}
	}

	addNode(label: NodeLabel): NodeId {
		const nodeId = this._getId()
		this._addNode(nodeId, label)
		return nodeId
	}

	private _addNode(nodeId: NodeId, label: NodeLabel) {
		this._nodes.set(nodeId, label)
		if (this._isCompound) {
			this._parent!.set(nodeId, null)
			this._children!.set(nodeId, new Set())
			this._children!.get(null)!.add(nodeId)
		}

		this._in.set(nodeId, new Set())
		this._preds.set(nodeId, new Map())
		this._out.set(nodeId, new Set())
		this._sucs.set(nodeId, new Map())
		this._nodeCount++
	}

	setNode(nodeId: NodeId, label: NodeLabel) {
		if (this._nodes.has(nodeId)) {
			this._nodes.set(nodeId, label)
		} else {
			throw new Error("node id not found")
		}
	}

	node(nodeId: NodeId): NodeLabel {
		if (this._nodes.has(nodeId)) {
			return this._nodes.get(nodeId)!
		} else {
			throw new Error("node id not found")
		}
	}

	hasNode(nodeId: NodeId): boolean {
		return this._nodes.has(nodeId)
	}

	removeNode(nodeId: NodeId) {
		if (this._nodes.has(nodeId)) {
			this._nodes.delete(nodeId)
			if (this._isCompound) {
				this._removeFromParentsChildList(nodeId)
				this._parent!.delete(nodeId)
				for (const child of this._children!.get(nodeId)!) {
					this.setParent(child, null)
				}
				this._children!.delete(nodeId)
			}
			for (const edge of this._in.get(nodeId)!) {
				this.removeEdge(edge)
			}
			this._in.delete(nodeId)
			this._preds.delete(nodeId)
			for (const edge of this._out.get(nodeId)!) {
				this.removeEdge(edge)
			}
			this._out.delete(nodeId)
			this._sucs.delete(nodeId)
			this._nodeCount--
		}
	}

	setParent(nodeId: NodeId, parent: NodeId | null) {
		if (!this._isCompound) {
			throw new Error("Cannot set parent in a non-compound graph")
		} else if (parent !== null && !this.hasNode(parent)) {
			throw new Error("node id not found")
		} else if (!this.hasNode(nodeId)) {
			throw new Error("node id not found")
		}

		for (
			let ancestor = parent;
			ancestor !== null;
			ancestor = this.parent(ancestor)
		) {
			if (ancestor === nodeId) {
				throw new Error(
					`Setting ${parent} as parent of ${nodeId} would create a cycle`
				)
			}
		}

		this._removeFromParentsChildList(nodeId)
		this._parent!.set(nodeId, parent)
		this._children!.get(parent)!.add(nodeId)
	}

	private _removeFromParentsChildList(nodeId: string) {
		const parent = this.parent(nodeId)
		this._children!.get(parent)!.delete(nodeId)
	}

	parent(nodeId: NodeId): NodeId | null {
		if (!this._isCompound) {
			throw new Error("Cannot get parent in a non-compound graph")
		}

		const parent = this._parent!.get(nodeId)
		if (parent === undefined) {
			throw new Error("node id not found")
		}

		return parent
	}

	children(nodeId: NodeId | null): Iterable<NodeId> {
		if (!this._isCompound) {
			throw new Error("Cannot iterate children in a non-compound graph")
		}

		const children = this._children!.get(nodeId)
		if (children === undefined) {
			throw new Error("node id not found")
		}

		return children
	}

	predecessors(nodeId: NodeId): Iterable<NodeId> {
		const predecessors = this._preds.get(nodeId)
		if (predecessors === undefined) {
			throw new Error("ndoe id not found")
		}

		return predecessors.keys()
	}

	successors(nodeId: NodeId): Iterable<NodeId> {
		const successors = this._sucs.get(nodeId)
		if (successors === undefined) {
			throw new Error("ndoe id not found")
		}

		return successors.keys()
	}

	neighbors(nodeId: NodeId): Iterable<NodeId> {
		const neighbors = new Set<NodeId>()

		for (const predecessor of this.predecessors(nodeId)) {
			neighbors.add(predecessor)
		}

		for (const successor of this.successors(nodeId)) {
			neighbors.add(successor)
		}

		return neighbors
	}

	isLeaf(nodeId: NodeId): boolean {
		const neighbors = new Set<NodeId>(this.successors(nodeId))
		if (!this._isDirected) {
			for (const predecessor of this.predecessors(nodeId)) {
				neighbors.add(predecessor)
			}
		}

		return neighbors.size === 0
	}

	filterNodes(
		filter: (nodeId: NodeId, label: NodeLabel) => boolean
	): Graph<GraphLabel, NodeLabel, EdgeLabel> {
		const graph = new Graph<GraphLabel, NodeLabel, EdgeLabel>(this._label, {
			directed: this._isDirected,
			multigraph: this._isMultigraph,
			compound: this._isCompound,
		})

		for (const [nodeId, label] of this._nodes) {
			if (filter(nodeId, label)) {
				graph.setNode(nodeId, label)
			}
		}

		for (const [edgeId, label] of this._edges) {
			const edge = this._parseEdgeId(edgeId)
			if (graph.hasNode(edge.source) && graph.hasNode(edge.target)) {
				graph._addEdge(edge, label)
			}
		}

		const parents = new Map<NodeId, NodeId | null>()
		const findParent = (nodeId: NodeId): NodeId | null => {
			const parent = this.parent(nodeId)
			if (parent === null || graph.hasNode(parent)) {
				parents.set(nodeId, parent)
				return parent
			} else if (parents.has(parent)) {
				return parents.get(parent)!
			} else {
				return findParent(parent)
			}
		}

		if (this._isCompound) {
			for (const id of graph.nodes()) {
				graph.setParent(id, findParent(id))
			}
		}

		return graph
	}

	edgeCount(): number {
		return this._edgeCount
	}

	edges(): Iterable<EdgeId> {
		return this._edges.keys()
	}

	addEdge(source: NodeId, target: NodeId, label: EdgeLabel): EdgeId {
		const edge = this._isMultigraph
			? { source, target, tag: this._getId() }
			: { source, target }

		return this._addEdge(edge, label)
	}

	private _addEdge(edge: EdgeObject, label: EdgeLabel): EdgeId {
		if (!this.hasNode(edge.source)) {
			throw new Error("source node does not exist")
		} else if (!this.hasNode(edge.target)) {
			throw new Error("target node does not exist")
		} else if (this._isMultigraph && edge.tag === undefined) {
			throw new Error("multigraph edge ids must have tags")
		} else if (!this._isMultigraph && edge.tag !== undefined) {
			throw new Error("only multigraph edges can have tags")
		}

		const edgeId = this._makeEdgeId(edge)

		if (this._isMultigraph || !this._edges.has(edgeId)) {
			incrementOrInitEntry(this._preds.get(edge.target)!, edge.source)
			incrementOrInitEntry(this._sucs.get(edge.source)!, edge.target)

			this._in.get(edge.target)!.add(edgeId)
			this._out.get(edge.source)!.add(edgeId)

			this._edgeCount++
		}

		this._edges.set(edgeId, label)
		return edgeId
	}

	setEdge(edgeId: EdgeId, label: EdgeLabel) {
		if (this._edges.has(edgeId)) {
			this._edges.set(edgeId, label)
		} else {
			throw new Error("edge id not found")
		}
	}

	addPath(path: NodeId[], label: EdgeLabel) {
		path.reduce((source, target) => {
			this.addEdge(source, target, label)
			return target
		})
	}

	edge(edgeId: EdgeId): EdgeLabel {
		if (this._edges.has(edgeId)) {
			return this._edges.get(edgeId)!
		} else {
			throw new Error("edge id not found")
		}
	}

	hasEdge(edgeId: EdgeId): boolean {
		return this._edges.has(edgeId)
	}

	removeEdge(edgeId: EdgeId) {
		if (this._edges.has(edgeId)) {
			const { source, target } = this._parseEdgeId(edgeId)
			this._edges.delete(edgeId)

			decrementOrRemoveEntry(this._preds.get(target)!, source)
			decrementOrRemoveEntry(this._sucs.get(source)!, target)

			this._in.get(target)!.delete(edgeId)
			this._out.get(source)!.delete(edgeId)

			this._edgeCount--
		}
	}

	*inEdges(target: NodeId, source?: NodeId): Iterable<EdgeId> {
		const incoming = this._in.get(target)
		if (incoming === undefined) {
			throw new Error("target id not found")
		}
		if (source === undefined) {
			for (const edgeId of incoming) {
				yield edgeId
			}
		} else {
			const outgoing = this._out.get(source)
			if (outgoing === undefined) {
				throw new Error("source id not found")
			}
			for (const edgeId of incoming) {
				if (outgoing.has(edgeId)) {
					yield edgeId
				}
			}
		}
	}

	*outEdges(source: NodeId, target?: NodeId): Iterable<EdgeId> {
		const outgoing = this._out.get(source)
		if (outgoing === undefined) {
			throw new Error("source id not found")
		}
		if (target === undefined) {
			for (const edgeId of outgoing) {
				yield edgeId
			}
		} else {
			const incoming = this._in.get(target)
			if (incoming === undefined) {
				throw new Error("target id not found")
			}
			for (const edgeId of outgoing) {
				if (incoming.has(edgeId)) {
					yield edgeId
				}
			}
		}
	}

	*nodeEdges(nodeId: string) {
		for (const edgeId of this.inEdges(nodeId)) {
			yield edgeId
		}
		for (const edgeId of this.outEdges(nodeId)) {
			yield edgeId
		}
	}
}

function incrementOrInitEntry(map: Map<string, number>, key: string) {
	const value = map.get(key)
	if (value === undefined) {
		map.set(key, 1)
	} else {
		map.set(key, value + 1)
	}
}

function decrementOrRemoveEntry(map: Map<string, number>, key: string) {
	const value = map.get(key)
	if (value === undefined) {
		throw new Error("key not found in map")
	} else if (value === 1) {
		map.delete(key)
	} else {
		map.set(key, value - 1)
	}
}
