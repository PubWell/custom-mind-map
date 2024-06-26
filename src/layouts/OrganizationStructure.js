import Base from './Base'
import { walk, asyncRun, getNodeIndexInNodeList } from '../utils'

//  组织结构图
// 和逻辑结构图基本一样，只是方向变成向下生长，所以先计算节点的top，后计算节点的left、最后调整节点的left即可
class OrganizationStructure extends Base {
  //  构造函数
  constructor(opt = {}) {
    super(opt)
  }

  //  布局
  doLayout(callback) {
    let task = [
      () => {
        this.computedBaseValue()
      },
      () => {
        this.computedLeftValue()
      },
      () => {
        this.adjustLeftValue()
      },
      () => {
        callback(this.root)
      }
    ]
    asyncRun(task)
  }

  //  遍历数据计算节点的left、width、height
  computedBaseValue() {
    walk(
      this.renderer.renderTree,
      null,
      (cur, parent, isRoot, layerIndex) => {
        let newNode = this.createNode(cur, parent, isRoot, layerIndex)
        // 根节点定位在画布中心位置
        if (isRoot) {
          this.setNodeCenter(newNode)
        } else {
          // 非根节点
          // 定位到父节点下方
          newNode.top =
            parent._node.top + parent._node.height + this.getMarginX(layerIndex)
        }
        if (!cur.data.expand) {
          return true
        }
      },
      (cur, parent, isRoot, layerIndex) => {
        // 返回时计算节点的areaWidth，也就是子节点所占的宽度之和，包括外边距
        let len = cur.data.expand === false ? 0 : cur._node.children.length
        cur._node.childrenAreaWidth = len
          ? cur._node.children.reduce((h, item) => {
              return h + item.width
            }, 0) +
            (len + 1) * this.getMarginY(layerIndex + 1)
          : 0

        // 如果存在概要，则和概要的高度取最大值
        let generalizationNodeWidth = cur._node.checkHasGeneralization()
          ? cur._node._generalizationNodeWidth + this.getMarginY(layerIndex + 1)
          : 0
        cur._node.childrenAreaWidth2 = Math.max(
          cur._node.childrenAreaWidth,
          generalizationNodeWidth
        )
      },
      true,
      0
    )
  }

  //  遍历节点树计算节点的left
  computedLeftValue() {
    walk(
      this.root,
      null,
      (node, parent, isRoot, layerIndex) => {
        if (node.getData('expand') && node.children && node.children.length) {
          let marginX = this.getMarginY(layerIndex + 1)
          // 第一个子节点的left值 = 该节点中心的left值 - 子节点的宽度之和的一半
          let left = node.left + node.width / 2 - node.childrenAreaWidth / 2
          let totalLeft = left + marginX
          node.children.forEach((cur, index) => {
            // 强制中心节点垂直时会造成同级和子级节点重叠
            // if(node.children.length % 2 > 0 && index == (node.children.length - 1)/2
            //     && index > 0 && node.children[index-1].left + node.children[index-1].width > node.left + node.width / 2 - cur.width / 2
            //   ){
            //   cur.left = node.left + node.width / 2 - cur.width / 2
            //   let diff = cur.left - totalLeft
            //   totalLeft += cur.width + marginX + diff
            // }else{
            // }
            cur.left = totalLeft
            totalLeft += cur.width + marginX
          })
        }
      },
      null,
      true
    )
  }

  //  调整节点left
  adjustLeftValue() {
    walk(
      this.root,
      null,
      (node, parent, isRoot, layerIndex) => {
        if (!node.getData('expand')) {
          return
        }
        // 判断子节点所占的宽度之和是否大于该节点自身，大于则需要调整位置
        let difference =
          node.childrenAreaWidth2 -
          this.getMarginY(layerIndex + 1) * 2 -
          node.width
        if (difference > 0) {
          this.updateBrothers(node, difference / 2)
        }
      },
      null,
      true
    )
  }

  //  更新兄弟节点的left
  updateBrothers(node, addWidth) {
    if (node.parent) {
      let childrenList = node.parent.children
      let index = getNodeIndexInNodeList(node, childrenList)
      childrenList.forEach((item, _index) => {
        if (item.hasCustomPosition()) {
          // 适配自定义位置
          return
        }
        let _offset = 0
        // 上面的节点往上移
        if (_index < index) {
          _offset = -addWidth
        } else if (_index > index) {
          // 下面的节点往下移
          _offset = addWidth
        }
        item.left += _offset
        // 同步更新子节点的位置
        if (item.children && item.children.length) {
          this.updateChildren(item.children, 'left', _offset)
        }
      })
      // 更新父节点的位置
      this.updateBrothers(node.parent, addWidth)
    }
  }

  //  绘制连线，连接该节点到其子节点
  renderLine(node, lines, style, lineStyle) {
    if (lineStyle === 'curve') {
      this.renderLineCurve(node, lines, style)
    } else if (lineStyle === 'direct') {
      this.renderLineDirect(node, lines, style)
    } else {
      this.renderLineStraight(node, lines, style)
    }
  }

  //  曲线风格连线
  renderLineCurve(node, lines, style) {
    if (node.children.length <= 0) {
      return []
    }
    let { left, top, width, height, expandBtnSize } = node
    if (!this.mindMap.opt.alwaysShowExpandBtn) {
      expandBtnSize = 0
    }
    const {
      nodeUseLineStyle,
      rootLineStartPositionKeepSameInCurve,
      rootLineKeepSameInCurve
    } = this.mindMap.themeConfig
    node.children.forEach((item, index) => {
      if (node.layerIndex === 0) {
        expandBtnSize = 0
      }
      let x1 =
        node.layerIndex === 0 && !rootLineStartPositionKeepSameInCurve
          ? left + width / 2
          : left + width / 2
      let y1 = top + height
      let x2 = item.left + item.width / 2
      let y2 = item.top
      let path = ''
      y1 = nodeUseLineStyle && !node.isRoot ? y1 + height / 2 : y1
      y2 = nodeUseLineStyle ? y2 + item.height / 2 : y2
      // 节点使用横线风格，需要额外渲染横线
      let nodeUseLineStylePath = nodeUseLineStyle
        ? ` L ${item.left + item.width},${y2}`
        : ''
      if (node.isRoot && !rootLineKeepSameInCurve) {
        path = this.quadraticCurvePathVertical(x1, y1, x2, y2) + nodeUseLineStylePath
      } else {
        path = this.cubicBezierPathVertical(x1, y1, x2, y2) + nodeUseLineStylePath
      }
      this.setLineStyle(style, lines[index], path, item)
    })
  }

  //  直连风格
  renderLineDirect(node, lines, style) {
    if (node.children.length <= 0) {
      return []
    }
    let { left, top, width, height } = node
    const { nodeUseLineStyle } = this.mindMap.themeConfig
    let x1 = left + width / 2
    let y1 = top + height
    node.children.forEach((item, index) => {
      let x2 = item.left + item.width / 2
      let y2 = item.top
      // 节点使用横线风格，需要额外渲染横线
      let nodeUseLineStylePath = nodeUseLineStyle
        ? ` L ${item.left},${y2} L ${item.left + item.width},${y2}`
        : ''
      let path = `M ${x1},${y1} L ${x2},${y2}` + nodeUseLineStylePath
      this.setLineStyle(style, lines[index], path, item)
    })
  }

  //  直线风格连线
  renderLineStraight(node, lines, style) {
    if (node.children.length <= 0) {
      return []
    }
    let { left, top, width, height, expandBtnSize, isRoot } = node
    if (!this.mindMap.opt.alwaysShowExpandBtn) {
      expandBtnSize = 0
    }
    let x1 = left + width / 2
    let y1 = top + height
    let marginX = this.getMarginX(node.layerIndex + 1)
    let s1 = marginX * 0.4
    let minx = Infinity
    let maxx = -Infinity
    let len = node.children.length
    expandBtnSize = len > 0 && !isRoot ? expandBtnSize : 0

    let dx = width / (len + 1)
    let rStart = node.children.findIndex((item, index) => item.left + item.width / 2 > left + dx * (index + 1))
    let rdy = marginX * 0.2 / (len - rStart + 1),
        ldy = marginX * 0.2 / (rStart + 1)

        // 奇数个中心节点垂直时：ldy = len % 2 === 0 ? marginX * 0.2 / (rStart + 1) : Math.floor(len / 2) == rStart ? marginX * 0.2 / (rStart + 1) : marginX * 0.2 / rStart

    node.children.forEach((item, index) => {
      let x2 = item.left + item.width / 2
      x1 = left + dx * (index + 1)
      y1 = index < rStart ? parseInt(top + height + s1 + ldy * (index + 1)) : parseInt(top + height + s1 + rdy * (len - index))

      let y2 = parseInt(y1 + s1) > item.top ? item.top + item.height : item.top

      if (x2 < minx) {
        minx = x2
      }
      if (x2 > maxx) {
        maxx = x2
      }
      // 节点使用横线风格，需要额外渲染横线
      let nodeUseLineStylePath = this.mindMap.themeConfig.nodeUseLineStyle
        ? ` L ${item.left},${y2} L ${item.left + item.width},${y2}`
        : ''
      let mid = len == 1 ? `` : `L ${x1},${y1} L ${x2},${y1}`
      let path = `M ${x1},${top + height + expandBtnSize} ${mid} L ${x2},${y2}` + nodeUseLineStylePath
      this.setLineStyle(style, lines[index], path, item)
      // 水平线
      // let lin2 = this.lineDraw.path()
      // node.style.line(lin2)
      // lin2.plot(this.transformPath(`M ${x1},${y1 + s1} L ${x2},${y1 + s1}`))
      // node._lines.push(lin2)
      // style && style(lin2, node)
    })
    // minx = Math.min(x1, minx)
    // maxx = Math.max(x1, maxx)
    // 父节点的竖线
    // let line1 = this.lineDraw.path()
    // node.style.line(line1)
    // expandBtnSize = len > 0 && !isRoot ? expandBtnSize : 0
    // line1.plot(
    //   this.transformPath(`M ${x1},${y1 + expandBtnSize} L ${x1},${y1 + s1}`)
    // )
    // node._lines.push(line1)
    // style && style(line1, node)
  }

  //  渲染按钮
  renderExpandBtn(node, btn) {
    let { width, height, expandBtnSize } = node
    let { translateX, translateY } = btn.transform()
    btn.translate(
      width / 2 - expandBtnSize / 2 - translateX,
      height + expandBtnSize / 2 - translateY
    )
  }

  //  创建概要节点
  renderGeneralization(list) {
    list.forEach(item => {
      let {
        bottom,
        left,
        right,
        generalizationLineMargin,
        generalizationNodeMargin
      } = this.getNodeGeneralizationRenderBoundaries(item, 'v')
      let x1 = left
      let y1 = bottom + generalizationLineMargin
      let x2 = right
      let y2 = bottom + generalizationLineMargin
      let cx = x1 + (x2 - x1) / 2
      let cy = y1 + 20
      let path = `M ${x1},${y1} Q ${cx},${cy} ${x2},${y2}`
      item.generalizationLine.plot(this.transformPath(path))
      item.generalizationNode.top = bottom + generalizationNodeMargin
      item.generalizationNode.left =
        left + (right - left - item.generalizationNode.width) / 2
    })
  }

  // 渲染展开收起按钮的隐藏占位元素
  renderExpandBtnRect(rect, expandBtnSize, width, height, node) {
    rect.size(width, expandBtnSize).x(0).y(height)
  }
}

export default OrganizationStructure
