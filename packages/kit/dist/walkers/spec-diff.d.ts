type StoryModule = any;
type ComposeStories = (storyModule: StoryModule) => Record<string, any>;
export declare function runSpecDiffWalker({ stories, specsByComponent, composeStories }: {
    stories: Record<string, StoryModule>;
    specsByComponent: Record<string, any>;
    composeStories: ComposeStories;
}): void;
export {};
//# sourceMappingURL=spec-diff.d.ts.map