/*
  termap - Terminal Map Viewer
  by Michael Strassburger <codepoet@cpan.org>

  Using 2D spatial indexing to avoid overlapping labels and markers
  and to find labels underneath a mouse cursor's position
*/
'use strict';

const RBush = require('rbush');
const stringWidth = require('string-width');

interface Item {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  feature?: any;
}

class LabelBuffer {
  tree: any;
  margin: number;

  constructor() {
    this.tree = new RBush();
    this.margin = 5;
  }

  clear(): void {
    this.tree.clear();
  }

  project(x: number, y: number): [number, number] {
    return [Math.floor(x / 2), Math.floor(y / 4)];
  }

  writeIfPossible(text: string, x: number, y: number, feature: any, margin?: number): boolean | undefined {
    margin = margin || this.margin;

    const point = this.project(x, y);

    if (this._hasSpace(text, point[0], point[1])) {
      const data = this._calculateArea(text, point[0], point[1], margin);
      data.feature = feature;
      return this.tree.insert(data);
    } else {
      return false;
    }
  }

  featuresAt(x: number, y: number): void {
    this.tree.search({ minX: x, maxX: x, minY: y, maxY: y });
  }

  private _hasSpace(text: string, x: number, y: number): boolean {
    return !this.tree.collides(this._calculateArea(text, x, y));
  }

  private _calculateArea(text: string, x: number, y: number, margin: number = 0): Item {
    return {
      minX: x - margin,
      minY: y - margin / 2,
      maxX: x + margin + stringWidth(text),
      maxY: y + margin / 2,
    };
  }
}

export = LabelBuffer;

