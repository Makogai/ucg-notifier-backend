export const scraperConfig = {
  home: {
    facultyMenuItemSelector: "li.menu-item.mega-menu",
    facultyMenuLabels: ["članice", "clanice"],
  },
  programs: {
    programLinkHrefContains: "/studprog/",
  },
  subjects: {
    headingText: "predmeti",
  },
  posts: {
    postsListHrefContains: "/objave_spisak/poslao/studprog/",
    postsTableSelector: "table",
  },
  facultyPosts: {
    // On the site this can appear with or without leading `/`:
    // - href="objave_spisak/poslao/fakultet/2"
    // - href="/objave_spisak/poslao/fakultet/2"
    postsListHrefContains: "objave_spisak/poslao/fakultet/",
  },
} as const;

