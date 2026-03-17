import * as svgpathModule from "svgpath"

const svgpath = (svgpathModule as { default?: typeof svgpathModule }).default ?? svgpathModule

export default svgpath
