/*
  termap - Terminal Map Viewer
  by Michael Strassburger <codepoet@cpan.org>

  Minimalistic parser and compiler for Mapbox (Studio) Map Style files
  See: https://www.mapbox.com/mapbox-gl-style-spec/

  Compiles layer filter instructions into a chain of true/false returning
  anonymous functions to improve rendering speed compared to realtime parsing.
*/
'use strict';

interface StyleLayer {
  id: string;
  type?: string;
  'source-layer'?: string;
  minzoom?: number;
  maxzoom?: number;
  filter?: any[];
  ref?: string;
  paint?: any;
  appliesTo?: (feature: any) => boolean;
}

interface StyleConstants {
  [key: string]: any;
}

class Styler {
  styleById: { [key: string]: StyleLayer };
  styleByLayer: { [key: string]: StyleLayer[] };
  styleName: string;

  constructor(style: { name?: string; constants?: StyleConstants; layers: StyleLayer[] }) {
    this.styleById = {};
    this.styleByLayer = {};
    let base: { [key: string]: StyleLayer[] };
    let name: string;
    this.styleName = style.name || '';
    if (style.constants) {
      this._replaceConstants(style.constants, style.layers as any);
    }

    for (const layer of style.layers) {
      if (layer.ref && this.styleById[layer.ref]) {
        for (const ref of ['type', 'source-layer', 'minzoom', 'maxzoom', 'filter']) {
          if (this.styleById[layer.ref][ref as keyof StyleLayer] && !layer[ref as keyof StyleLayer]) {
            layer[ref as keyof StyleLayer] = this.styleById[layer.ref][ref as keyof StyleLayer];
          }
        }
      }

      layer.appliesTo = this._compileFilter(layer.filter);

      if ((base = this.styleByLayer)[name = layer['source-layer'] || ''] == null) {
        base[name] = [];
      }
      this.styleByLayer[layer['source-layer'] || ''].push(layer);
      this.styleById[layer.id] = layer;
    }
  }

  getStyleFor(layer: string, feature: any): StyleLayer | false {
    if (!this.styleByLayer[layer]) {
      return false;
    }

    for (const style of this.styleByLayer[layer]) {
      if (style.appliesTo(feature)) {
        return style;
      }
    }

    return false;
  }

  private _replaceConstants(constants: StyleConstants, tree: any): void {
    for (const id in tree) {
      const node = tree[id];
      switch (typeof node) {
        case 'object':
          if (node.constructor.name.match(/Stream/)) {
            continue;
          }
          this._replaceConstants(constants, node);
          break;
        case 'string':
          if (node.charAt(0) === '@') {
            tree[id] = constants[node];
          }
      }
    }
  }

  //TODO Better translation of the long cases.
  private _compileFilter(filter: any[] | undefined): (feature: any) => boolean {
    let filters: ((feature: any) => boolean)[];
    switch (filter != null ? filter[0] : void 0) {
      case 'all':
        filter = filter!.slice(1);
        filters = (() => {
          return filter!.map((sub) => this._compileFilter(sub));
        }).call(this) as ((feature: any) => boolean)[];
        return (feature: any) => !!filters.find((appliesTo) => {
          return !appliesTo(feature);
        });
      case 'any':
        filter = filter!.slice(1);
        filters = (() => {
          return filter!.map((sub) => this._compileFilter(sub));
        }).call(this) as ((feature: any) => boolean)[];
        return (feature: any) => !!filters.find((appliesTo) => {
          return appliesTo(feature);
        });
      case 'none':
        filter = filter!.slice(1);
        filters = (() => {
          return filter!.map((sub) => this._compileFilter(sub));
        }).call(this) as ((feature: any) => boolean)[];
        return (feature: any) => !filters.find((appliesTo) => {
          return !appliesTo(feature);
        });
      case '==':
        return (feature: any) => feature.properties[filter![1]] === filter![2];
      case '!=':
        return (feature: any) => feature.properties[filter![1]] !== filter![2];
      case 'in':
        return (feature: any) => !!filter!.slice(2).find((value) => {
          return feature.properties[filter![1]] === value;
        });
      case '!in':
        return (feature: any) => !filter!.slice(2).find((value) => {
          return feature.properties[filter![1]] === value;
        });
      case 'has':
        return (feature: any) => !!feature.properties[filter![1]];
      case '!has':
        return (feature: any) => !feature.properties[filter![1]];
      case '>':
        return (feature: any) => feature.properties[filter![1]] > filter![2];
      case '>=':
        return (feature: any) => feature.properties[filter![1]] >= filter![2];
      case '<':
        return (feature: any) => feature.properties[filter![1]] < filter![2];
      case '<=':
        return (feature: any) => feature.properties[filter![1]] <= filter![2];
      default:
        return () => true;
    }
  }
}

export = Styler;

