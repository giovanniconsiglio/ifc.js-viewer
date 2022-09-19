import resolve from "@rollup/plugin-node-resolve";
import commonjs from "@rollup/plugin-commonjs";

export default {
  input: "./js/app.js",
  output: [
    {
      format: "esm",
      file: "./js/bundle.js",
    },
  ],
  plugins: [resolve(), commonjs()],
};
