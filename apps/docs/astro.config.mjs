// @ts-check
import { defineConfig } from 'astro/config'
import starlight from '@astrojs/starlight'
import rehypeMermaid from 'rehype-mermaid'

// https://astro.build/config
export default defineConfig({
  markdown: {
    // Renders ```mermaid fences to static inline <svg> at build time (headless
    // Playwright) so diagrams need no client JS. Dark theme + htmlLabels:false
    // avoid clipped multi-line labels — matches argo-v2's proven config.
    rehypePlugins: [
      [
        rehypeMermaid,
        {
          strategy: 'inline-svg',
          colorScheme: 'dark',
          mermaidConfig: {
            theme: 'dark',
            themeVariables: {
              fontSize: '16px',
              background: '#17181c',
              primaryColor: '#28304a',
              primaryTextColor: '#e8eaf2',
              primaryBorderColor: '#5b7cfa',
              secondaryColor: '#232a3d',
              secondaryBorderColor: '#5b7cfa',
              tertiaryColor: '#1e2433',
              tertiaryBorderColor: '#5b7cfa',
              lineColor: '#8891a8',
              textColor: '#e8eaf2',
              nodeTextColor: '#e8eaf2',
              mainBkg: '#28304a',
              nodeBorder: '#5b7cfa',
              clusterBkg: '#1e2433',
              clusterBorder: '#3a4258',
              edgeLabelBackground: '#232a3d',
              actorBkg: '#28304a',
              actorBorder: '#5b7cfa',
              actorTextColor: '#e8eaf2',
              signalColor: '#8891a8',
              signalTextColor: '#e8eaf2',
              labelBoxBkgColor: '#28304a',
              labelBoxBorderColor: '#5b7cfa',
              labelTextColor: '#e8eaf2',
              loopTextColor: '#e8eaf2',
              noteBkgColor: '#3a3320',
              noteBorderColor: '#8a7a3a',
              noteTextColor: '#e8eaf2'
            },
            flowchart: {
              htmlLabels: false
            }
          }
        }
      ]
    ]
  },
  integrations: [
    starlight({
      title: 'Argo — the way of working',
      social: [{ icon: 'github', label: 'GitHub', href: 'https://github.com/milad-alizadeh/argo-plugin' }],
      customCss: ['./src/styles/mermaid-zoom.css', './src/styles/dark-only.css'],
      head: [
        { tag: 'script', attrs: { src: '/mermaid-zoom.js', defer: true } },
        // Starlight has no config-level "dark only" toggle — pin the theme
        // pref before ThemeProvider reads localStorage, so it never renders
        // light even for a first-time visitor with a light OS preference.
        {
          tag: 'script',
          content: "localStorage.setItem('starlight-theme', 'dark')"
        }
      ],
      sidebar: [
        { label: 'Start here', items: [{ autogenerate: { directory: 'start-here' } }] },
        { label: 'Guides', items: [{ autogenerate: { directory: 'guides' } }] },
        { label: 'How it works', items: [{ autogenerate: { directory: 'how-it-works' } }] },
        { label: 'Reference', items: [{ autogenerate: { directory: 'reference' } }] }
      ]
    })
  ]
})
