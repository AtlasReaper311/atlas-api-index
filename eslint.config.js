// Flat config, no plugin dependencies: the estate gate is "does the
// Worker parse and avoid the obvious footguns", not a style debate.
export default [
  {
    files: ["src/**/*.js", "shared/**/*.js"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: {
        Response: "readonly",
        Request: "readonly",
        URL: "readonly",
        fetch: "readonly",
        console: "readonly",
        AbortSignal: "readonly",
      },
    },
    rules: {
      "no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
      "no-var": "error",
      "prefer-const": "error",
      eqeqeq: "error",
    },
  },
];
