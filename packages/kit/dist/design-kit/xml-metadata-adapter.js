/**
 * C1 gap fix (build-design-workflow.md): the Figma MCP `get_metadata` tool
 * returns a wireframe frame as XML, but `flattenToRegions`/`buildRegionContract`
 * (region-contract.js) consume the normalized JSON tree shape documented by
 * `test/fixtures/flatten-metadata-tree.json` (`{id, name, type, layoutMode?,
 * componentName?, children}`). This adapter is the missing ingest step between
 * the two — pure, no fs/network calls, so it is unit-testable off-Figma like
 * the rest of this package.
 */
const NUMERIC_ATTRS = ['x', 'y', 'width', 'height'];
function parseAttrs(attrString) {
    const attrs = {};
    const attrRegex = /(\w+)="([^"]*)"/g;
    let match;
    while ((match = attrRegex.exec(attrString))) {
        const [, key, value] = match;
        attrs[key] = NUMERIC_ATTRS.includes(key) ? Number(value) : value;
    }
    return attrs;
}
function toNode(tagName, attrs, children) {
    const node = {
        id: attrs.id,
        name: attrs.name,
        type: tagName.toUpperCase(),
        children
    };
    for (const key of NUMERIC_ATTRS) {
        if (attrs[key] !== undefined)
            node[key] = attrs[key];
    }
    if (attrs.layoutMode !== undefined)
        node.layoutMode = attrs.layoutMode;
    if (attrs.componentName !== undefined)
        node.componentName = attrs.componentName;
    return node;
}
// Matches an open tag (`<Frame ...>`), a self-closing tag (`<Text ... />`), or
// a close tag (`</Frame>`) — the only three token shapes `get_metadata`'s
// plain, namespace-free, attribute-only dump ever produces. A hand-rolled
// tokenizer rather than a full XML library: this well-defined slice needs no
// new dependency.
const TAG_TOKEN_REGEX = /<(\/)?(\w+)\s*([^>]*?)(\/)?>/g;
function tokenize(xml) {
    const tokens = [];
    let match;
    TAG_TOKEN_REGEX.lastIndex = 0;
    while ((match = TAG_TOKEN_REGEX.exec(xml))) {
        const [, isClose, tagName, attrString, isSelfClosing] = match;
        if (isClose) {
            tokens.push({ kind: 'close', tagName });
        }
        else if (isSelfClosing) {
            tokens.push({ kind: 'self', tagName, attrs: parseAttrs(attrString) });
        }
        else {
            tokens.push({ kind: 'open', tagName, attrs: parseAttrs(attrString) });
        }
    }
    return tokens;
}
/**
 * Stack-based build: an `open` token pushes a new (incomplete) node frame, a
 * `self` token is a completed leaf attached to the current top-of-stack, and
 * a `close` token pops the completed node and attaches it to its parent (or
 * returns it, at the root).
 */
export function parseMetadataXml(xml) {
    const tokens = tokenize(xml);
    const stack = [];
    for (const token of tokens) {
        if (token.kind === 'open') {
            stack.push({ tagName: token.tagName, attrs: token.attrs, children: [] });
            continue;
        }
        if (token.kind === 'self') {
            const leaf = toNode(token.tagName, token.attrs, []);
            if (stack.length === 0)
                return leaf;
            stack[stack.length - 1].children.push(leaf);
            continue;
        }
        // close
        const frame = stack.pop();
        const node = toNode(frame.tagName, frame.attrs, frame.children);
        if (stack.length === 0)
            return node;
        stack[stack.length - 1].children.push(node);
    }
    throw new Error('parseMetadataXml: unclosed element in XML input');
}
//# sourceMappingURL=xml-metadata-adapter.js.map