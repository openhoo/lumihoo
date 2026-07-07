const hooversionConfig = {
  branches: ["main"],
  packages: [
    {
      name: "lumihoo",
      path: ".",
      type: "node",
      manifest: "package.json",
      changelog: "CHANGELOG.md",
      scopes: ["lumihoo"],
      dependencies: [],
    },
  ],
  github: {
    releases: true,
  },
};

export default hooversionConfig;
