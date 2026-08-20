/** A tiny dependency-free router supporting `:param` path segments. */
export class Router {
  constructor() {
    this.routes = [];
  }

  _register(method, pattern, handler) {
    const paramNames = [];
    const regexSource = pattern
      .split("/")
      .map((segment) => {
        if (segment.startsWith(":")) {
          paramNames.push(segment.slice(1));
          return "([^/]+)";
        }
        return segment.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      })
      .join("/");
    this.routes.push({ method, regex: new RegExp(`^${regexSource}/?$`), paramNames, handler });
  }

  get(pattern, handler) {
    this._register("GET", pattern, handler);
  }

  post(pattern, handler) {
    this._register("POST", pattern, handler);
  }

  put(pattern, handler) {
    this._register("PUT", pattern, handler);
  }

  delete(pattern, handler) {
    this._register("DELETE", pattern, handler);
  }

  match(method, pathname) {
    for (const route of this.routes) {
      if (route.method !== method) continue;
      const match = route.regex.exec(pathname);
      if (!match) continue;
      const params = {};
      route.paramNames.forEach((name, i) => {
        params[name] = decodeURIComponent(match[i + 1]);
      });
      return { handler: route.handler, params };
    }
    return null;
  }
}
