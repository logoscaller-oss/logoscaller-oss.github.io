// 3D点云丝绸舞动效果
class PointCloud3D {
    constructor() {
        this.canvas = null;
        this.ctx = null;
        this.points = [];
        this.animationId = null;
        this.time = 0;
        this.mouse = { x: 0, y: 0 };
        this.init();
    }

    init() {
        // 创建canvas元素
        this.canvas = document.createElement('canvas');
        this.canvas.style.position = 'fixed';
        this.canvas.style.top = '0';
        this.canvas.style.left = '0';
        this.canvas.style.width = '100%';
        this.canvas.style.height = '100%';
        this.canvas.style.zIndex = '-1';
        this.canvas.style.pointerEvents = 'none';
        this.canvas.style.opacity = '0.6';
        
        document.body.appendChild(this.canvas);
        this.ctx = this.canvas.getContext('2d');
        
        this.resize();
        this.createPoints();
        this.bindEvents();
        this.animate();
    }

    resize() {
        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;
    }

    createPoints() {
        this.points = [];
        const pointCount = Math.floor((this.canvas.width * this.canvas.height) / 15000);
        
        for (let i = 0; i < pointCount; i++) {
            this.points.push({
                x: Math.random() * this.canvas.width,
                y: Math.random() * this.canvas.height,
                z: Math.random() * 1000 + 1,
                vx: (Math.random() - 0.5) * 0.5,
                vy: (Math.random() - 0.5) * 0.5,
                vz: (Math.random() - 0.5) * 0.5,
                size: Math.random() * 2 + 0.5,
                opacity: Math.random() * 0.8 + 0.2,
                color: this.getLuxuryColor()
            });
        }
    }

    getLuxuryColor() {
        const colors = [
            '#FFD700', // 金色
            '#C0C0C0', // 银色
            '#FF69B4', // 热粉色
            '#9370DB', // 中紫色
            '#00CED1', // 深绿松石色
            '#FF6347', // 番茄色
            '#32CD32', // 酸橙绿
            '#1E90FF', // 道奇蓝
            '#FF1493', // 深粉色
            '#8A2BE2'  // 蓝紫色
        ];
        return colors[Math.floor(Math.random() * colors.length)];
    }

    bindEvents() {
        window.addEventListener('resize', () => {
            this.resize();
            this.createPoints();
        });

        document.addEventListener('mousemove', (e) => {
            this.mouse.x = e.clientX;
            this.mouse.y = e.clientY;
        });
    }

    updatePoints() {
        this.time += 0.01;
        
        this.points.forEach(point => {
            // 丝绸般的流动效果
            const wave1 = Math.sin(point.x * 0.01 + this.time) * 0.5;
            const wave2 = Math.cos(point.y * 0.008 + this.time * 1.2) * 0.3;
            const wave3 = Math.sin((point.x + point.y) * 0.005 + this.time * 0.8) * 0.4;
            
            // 鼠标交互效果
            const dx = this.mouse.x - point.x;
            const dy = this.mouse.y - point.y;
            const distance = Math.sqrt(dx * dx + dy * dy);
            const mouseInfluence = Math.max(0, 1 - distance / 200);
            
            point.x += point.vx + wave1 + dx * mouseInfluence * 0.001;
            point.y += point.vy + wave2 + dy * mouseInfluence * 0.001;
            point.z += point.vz + wave3;
            
            // 边界处理 - 丝绸般的循环
            if (point.x < 0) point.x = this.canvas.width;
            if (point.x > this.canvas.width) point.x = 0;
            if (point.y < 0) point.y = this.canvas.height;
            if (point.y > this.canvas.height) point.y = 0;
            if (point.z < 0) point.z = 1000;
            if (point.z > 1000) point.z = 0;
            
            // 动态透明度变化
            point.opacity = 0.2 + Math.sin(this.time * 2 + point.x * 0.01) * 0.3;
        });
    }

    drawPoints() {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        
        // 按z轴深度排序
        const sortedPoints = [...this.points].sort((a, b) => a.z - b.z);
        
        sortedPoints.forEach(point => {
            const scale = 1 - (point.z / 1000);
            const x = point.x;
            const y = point.y;
            const size = point.size * scale;
            
            // 绘制点
            this.ctx.save();
            this.ctx.globalAlpha = point.opacity * scale;
            this.ctx.fillStyle = point.color;
            this.ctx.shadowColor = point.color;
            this.ctx.shadowBlur = size * 3;
            
            this.ctx.beginPath();
            this.ctx.arc(x, y, size, 0, Math.PI * 2);
            this.ctx.fill();
            
            // 添加光晕效果
            this.ctx.globalAlpha = point.opacity * scale * 0.3;
            this.ctx.beginPath();
            this.ctx.arc(x, y, size * 2, 0, Math.PI * 2);
            this.ctx.fill();
            
            this.ctx.restore();
        });
        
        // 绘制连接线 - 丝绸般的连接
        this.drawConnections(sortedPoints);
    }

    drawConnections(points) {
        for (let i = 0; i < points.length; i++) {
            for (let j = i + 1; j < points.length; j++) {
                const point1 = points[i];
                const point2 = points[j];
                
                const dx = point1.x - point2.x;
                const dy = point1.y - point2.y;
                const distance = Math.sqrt(dx * dx + dy * dy);
                
                if (distance < 120) {
                    const opacity = (1 - distance / 120) * 0.1;
                    const scale1 = 1 - (point1.z / 1000);
                    const scale2 = 1 - (point2.z / 1000);
                    
                    this.ctx.save();
                    this.ctx.globalAlpha = opacity * Math.min(scale1, scale2);
                    this.ctx.strokeStyle = '#FFD700';
                    this.ctx.lineWidth = 0.5;
                    this.ctx.shadowColor = '#FFD700';
                    this.ctx.shadowBlur = 2;
                    
                    this.ctx.beginPath();
                    this.ctx.moveTo(point1.x, point1.y);
                    this.ctx.lineTo(point2.x, point2.y);
                    this.ctx.stroke();
                    this.ctx.restore();
                }
            }
        }
    }

    animate() {
        this.updatePoints();
        this.drawPoints();
        this.animationId = requestAnimationFrame(() => this.animate());
    }

    destroy() {
        if (this.animationId) {
            cancelAnimationFrame(this.animationId);
        }
        if (this.canvas && this.canvas.parentNode) {
            this.canvas.parentNode.removeChild(this.canvas);
        }
    }
}

// 初始化3D点云效果
document.addEventListener('DOMContentLoaded', () => {
    window.pointCloud3D = new PointCloud3D();
});
