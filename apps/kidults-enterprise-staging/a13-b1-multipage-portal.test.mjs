import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
const root=path.resolve("apps/kidults-enterprise-staging/public/a13-b1");
const pages=["index.html","markets/index.html","kidult-100/index.html","research/index.html","canon/index.html","enterprise/index.html","methodology/index.html","archive/index.html","status/index.html","about/index.html"];
for(const page of pages){assert.ok(fs.existsSync(path.join(root,page)),`${page} missing`);const html=fs.readFileSync(path.join(root,page),"utf8");assert.match(html,/portal\.css/);assert.match(html,/shell\.js/);assert.match(html,/portal\.js/);assert.match(html,/data-global-header/);assert.match(html,/data-global-trust/);assert.match(html,/data-global-footer/);}
const shell=fs.readFileSync(path.join(root,"assets/shell.js"),"utf8");for(const label of ["Markets","Kidult 100","Research","Canon","Enterprise","Methodology","Archive"]){assert.match(shell,new RegExp(label));}
const css=fs.readFileSync(path.join(root,"assets/portal.css"),"utf8");assert.match(css,/Cormorant Garamond/);assert.match(css,/@media\(max-width:380px\)/);const runtime=fs.readFileSync(path.join(root,"assets/portal.js"),"utf8");assert.match(runtime,/tallDigits/);console.log("A13-B1 multipage portal contract OK");