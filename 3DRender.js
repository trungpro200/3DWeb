var bo = document.getElementById("win")

var css_vals = document.querySelector(':root')
css_vals = getComputedStyle(css_vals)

class Camera {
    constructor(pos, fov = 75) {
        this.screenHeight = parent.innerHeight
        this.screenWidth = parent.innerWidth

        this.fov = fov //math.unit(`${fov}deg`)
        this.farPlane = 1000
        this.nearPlane = 0.1

        this.fovMatrix = math.matrix([
            [1 / (math.tan(this.fov) * (this.screenWidth / this.screenHeight)), 0, 0, 0],
            [0, 1 / math.tan(this.fov), 0, 0],
            [0, 0, -(this.farPlane + this.nearPlane) / (this.farPlane - this.nearPlane), -2 * this.farPlane * this.nearPlane / (this.farPlane - this.nearPlane)],
            [0, 0, -1, 0]
        ]);


        this.pos = math.matrix(pos)


        this.V = this.createView([0,0,0])
    }
    /**
     * 
     * @param {Array} target where should I look at? 
     * @returns {math.Matrix}
     */
    createView(target) {
        target = math.matrix(target)

        var D = math.subtract(target, this.pos).toArray() //forward vector
        D = math.divide(D, math.norm(D))

        var R = math.cross([[0, 1, 0]], D)[0]      //Right vector
        var U = math.cross(D, R)                    //Up vector

        var V = math.matrix([
            [R[0], R[1], R[2], -math.dot(R,this.pos)],
            [U[0], U[1], U[2], -math.dot(U,this.pos)],
            [D[0], D[1], D[2], -math.dot(D,this.pos)],
            [0, 0, 0, 1]
        ])

        this.forwardVector = D
        
        return V
    }
}

class Object_3D {
    /**
     * 
     * @param {String} objPath 
     * @param {number[]} pos 
     * @param {number} scale 
     */
    constructor(objPath,reflective = 0.8 , pos=[0,0,0], scale = 1) {
        this.reflective = reflective

        this.color = [255,255,255]

        this.vertices = []
        this.edges = []
        this.normals = []
        this.faces = {
            Vertex_Groups: [],
            Normals: [],
            Culling: [],
            Textures: []
        }

        this.objPath = objPath
        
        this.origin = pos
        if (this.origin.length<4){
            this.origin.push(1)
        }

        this.vtCam = []
        // this.read()


        // console.log(this.vertices.length)
    }
    //Format 'vertex/texture/normal' (Array(3))
    extractFace(s){
        var VTN = [
            [],
            [],
            []
        ]

        s.forEach(vtn=>{
            vtn = vtn.split('/')
            vtn.forEach((val, k)=>{
                
                if (!val){
                    VTN[k].push(NaN)
                    return
                }

                VTN[k].push(val-1)
            })
        })

        // VTN[0].forEach((vg,i) =>{
        //     VTN[0][i]=this.vertices[vg].slice(0,3)
        // })
        VTN[2] = math.dotDivide(this.normals[VTN[2][0]],math.norm(this.normals[VTN[2][0]],3))

        

        this.faces.Vertex_Groups.push(VTN[0])
        this.faces.Textures.push(VTN[1])
        this.faces.Normals.push(VTN[2])
    }

    read(){
        return fetch(this.objPath)
            .then(res => res.text())
            .then((text) => {
                text.split('\n').forEach(line =>{
                    if (line.startsWith('#')){
                        return
                    }

                    var l = line.slice(2).split(" ").map(e =>{
                        return parseFloat(e)
                    })
                    if (line.startsWith('vt')){
                        return
                    } else if (line.startsWith('vn')){
                        this.normals.push(l.splice(1))
                    } 
                    else if (line.startsWith('v')){
                        l.push(1)
                        this.vertices.push(l)
                        // console.log(l)
                    } else if (line.startsWith('l')){
                        this.edges.push(math.subtract(l, 1))
                    } else if (line.startsWith('f')){
                        l = line.slice(2).split(" ")
                        this.extractFace(l)
                    }
                })
            }).catch(e => console.log(e))
    }
}

class Scene {
    /**
     * 
     * @param {Camera} camera 
     * @param {Object_3D[]} objs 
     */
    constructor(camera, objs) {
        this.ambientLight = 0.3
        this.lightSources = []

        this.camera = camera
        this.objs = objs
        this.vtOffset = math.floor(parseInt(css_vals.getPropertyValue('--vt-size'))/2)
        this.canvas = document.createElement("canvas")



        this.canvas.id = "canv"
        this.canvas.width = camera.screenWidth
        this.canvas.height = camera.screenHeight

        this.ctx = this.canvas.getContext("2d")
        this.ctx.strokeStyle="white"
        this.ctx.imageSmoothingEnabled = false;

        bo.appendChild(this.canvas)

        Promise.all(objs.map(o=>o.read())).then(()=>{
            this.createLight(1, [0,5,4])
            this.renderObjsVts()
            this.renderFaces()
        })
    }

    async renderObjsVts(dot = false){
        this.objs.forEach(O=>{
            // console.log(math.transpose(O.vertices))

            var T = math.multiply(this.camera.fovMatrix,this.camera.V)

            O.vtCam = math.multiply(
                 T, math.transpose(O.vertices)
            ).toArray()


            
            O.vtCam = math.dotDivide(O.vtCam,O.vtCam[3])
            O.vtCam[0] = math.round(
                math.multiply(math.add(O.vtCam[0],1), this.camera.screenWidth/2)
            )

            O.vtCam[1] = math.round(
                math.multiply(math.subtract(1,O.vtCam[1]), this.camera.screenHeight/2)
            )
        })
    }

    async renderFaces(){ //and maybe edges also 
        this.getCulling()
        this.objs.forEach(O=>{
            var Its = math.zeros(O.faces.Vertex_Groups.length)
            this.lightSources.forEach(ls=>{
                Its = math.add(Its, math.multiply(O.faces.Normals, ls.facing))
            })

            Its = Its.map(e=>{
                return Math.max(e,0)
            }).toArray()

            // console.log(O.faces.Culling)


            O.faces.Vertex_Groups.forEach((group, key)=>{
                if (O.faces.Culling[key]>=0){//facing away then don't render
                    return
                }
                // console.log(Its)
                var color = math.multiply(O.color, this.ambientLight+Its[key])
                color = math.multiply(color, O.reflective)
                this.ctx.fillStyle = `rgb(${color[0]},${color[1]},${color[2]})`

                var surface = new Path2D()
                surface.moveTo(O.vtCam[0][group[0]]+0.5, O.vtCam[1][group[0]]+0.5)

                group.forEach(vtIndex=>{
                    surface.lineTo(O.vtCam[0][vtIndex]+0.5, O.vtCam[1][vtIndex]+0.5)
                })

                this.ctx.fill(surface)
            })
        })
    }
    /**
     * 
     * @param {Array} pos 
     * @param {Array} target 
     */
    createLight(intensity=1, pos, target=[0,0,0]){ //Sunlight (1 direction only)

        this.lightSources.push({
            pos: pos,
            facing: math.divide(math.subtract(pos,target), math.norm(math.subtract(target,pos))),
            intensity: intensity
        })
    }

    getCulling(){
        this.objs.forEach(O=>{
            O.faces.Culling = math.multiply(O.faces.Normals,this.camera.forwardVector)
        })
    }
}

var cam = new Camera([-3, 2, -3])
var obj = new Object_3D("sphereN.obj")

var scene = new Scene(cam, [obj])

console.log()


// console.log(screen.width)
// console.log(cam.fovMatrix)
// console.log(tes.toArray()[0])
// console.log(math.norm([1,0,0])) //calc vector's lenght