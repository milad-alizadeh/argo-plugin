import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, it, expect } from 'vitest'
import { parseMetadataXml } from './xml-metadata-adapter.js'
import { flattenToRegions } from './region-contract.js'

const wireframeXmlPath = fileURLToPath(new URL('../../../../test/fixtures/wireframe-metadata.xml', import.meta.url))

describe('parseMetadataXml (C1 gap: get_metadata XML -> the normalized tree region-contract.js expects)', () => {
  it('parses a single self-closing leaf node into {id, name, type, children: []} (real get_metadata tags are lowercase)', () => {
    const xml = '<text id="1:3" name="Logo" x="16" y="16" width="100" height="32" />'

    expect(parseMetadataXml(xml)).toEqual({
      id: '1:3',
      name: 'Logo',
      type: 'TEXT',
      x: 16,
      y: 16,
      width: 100,
      height: 32,
      children: []
    })
  })

  it('parses a frame with one nested child into a node with a populated children array', () => {
    const xml = `
      <frame id="1:2" name="Header" x="0" y="0" width="1440" height="64">
        <text id="1:3" name="Logo" x="16" y="16" width="100" height="32" />
      </frame>
    `

    expect(parseMetadataXml(xml)).toEqual({
      id: '1:2',
      name: 'Header',
      type: 'FRAME',
      x: 0,
      y: 0,
      width: 1440,
      height: 64,
      children: [
        { id: '1:3', name: 'Logo', type: 'TEXT', x: 16, y: 16, width: 100, height: 32, children: [] }
      ]
    })
  })

  it('detects an instance from the tag alone — real get_metadata dumps carry no layoutMode/componentName attrs at all', () => {
    const xml = `
      <frame id="1:1" name="AppShell" x="0" y="0" width="1440" height="900">
        <instance id="1:2" name="Header" x="0" y="0" width="1440" height="64" />
      </frame>
    `

    const tree = parseMetadataXml(xml)

    expect(tree.layoutMode).toBeUndefined()
    expect(tree.children[0]).toMatchObject({ id: '1:2', name: 'Header', type: 'INSTANCE' })
    expect(tree.children[0].componentName).toBeUndefined()
  })

  it('feeds a real WF / <area> · <focus> get_metadata dump (captured live from file CLEHEoqvJlRti3dCCfOytS, node 372:85) straight into flattenToRegions, promoting each instance boundary by tag alone', () => {
    const xml = readFileSync(wireframeXmlPath, 'utf8')

    const tree = parseMetadataXml(xml)
    const regions = flattenToRegions(tree)
    const rootName = 'WF / Shell · rail empty (ROSTER-R21)'

    expect(tree.name).toBe(rootName)
    expect(regions.map((r) => r.path)).toEqual([
      `${rootName}/MainRow/Rail/EmptyState — zero projects (ROSTER-R21)/Button — New Project (ROSTER-R21 CTA)`,
      `${rootName}/MainRow/Stage/TerminalPanel — focused build session (default Stage content)`
    ])
  })
})
