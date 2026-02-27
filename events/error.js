module.exports = {
  name: "error",
  execute(error) {
    console.error("[CLIENT ERROR]", error);
  },
};
