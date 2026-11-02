const canvas = document.querySelector("#canvas");
const context = canvas.getContext("webgl");

if (!context) {
  throw new Error("WebGL is not supported by this browser.");
}

context.clearColor(0.06, 0.09, 0.16, 1);
context.clear(context.COLOR_BUFFER_BIT);
