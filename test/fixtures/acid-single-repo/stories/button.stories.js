/**
 * Smoke story (Slice 7): the minimal shape a real non-empty walker run needs.
 * The fixture's shims use a storybook-free composeStories stand-in, so this
 * module just exports runnable story objects.
 */
export const Primary = {
  async run() {
    return { container: { firstElementChild: null } }
  },
}
