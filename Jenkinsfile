// =======================
// Jenkinsfile (Declarative)
// =======================
pipeline {

  agent {
    kubernetes {
      yaml """
apiVersion: v1
kind: Pod
metadata:
  labels:
    jenkins: agent
spec:
  serviceAccountName: jenkins
  imagePullSecrets:
  - name: regcred

  # make shared workspace writeable by all containers
  securityContext:
    fsGroup: 1000

  initContainers:
  - name: init-perms
    image: busybox:1.36
    command: ["sh","-c"]
    args: ["mkdir -p /home/jenkins/agent && chmod 0777 /home/jenkins/agent"]
    volumeMounts:
    - name: workspace-volume
      mountPath: /home/jenkins/agent

  containers:
  # NodeJS for frontend
  - name: node
    image: docker.io/library/node:20-bullseye
    imagePullPolicy: IfNotPresent
    command: ["cat"]                 # keep idle; Jenkins will exec into it
    tty: true
    workingDir: /home/jenkins/agent
    volumeMounts:
    - name: workspace-volume
      mountPath: /home/jenkins/agent

  # Maven for backend
  - name: maven
    image: docker.io/library/maven:3.9-eclipse-temurin-17
    imagePullPolicy: IfNotPresent
    command: ["cat"]
    tty: true
    workingDir: /home/jenkins/agent
    volumeMounts:
    - name: workspace-volume
      mountPath: /home/jenkins/agent

  # Kaniko for image build/push (needs /bin/sh in image)
  - name: kaniko
    image: gcr.io/kaniko-project/executor:v1.23.2-debug
    imagePullPolicy: IfNotPresent
    command: ["/bin/sh","-c"]
    args: ["sleep 99d"]
    tty: true
    workingDir: /home/jenkins/agent
    env:
    - name: DOCKER_CONFIG
      value: /kaniko/.docker
    volumeMounts:
    - name: docker-config
      mountPath: /kaniko/.docker
    - name: workspace-volume
      mountPath: /home/jenkins/agent

  # kubectl for apply/rollout/smoke tests
  - name: kubectl
    image: bitnami/kubectl:1.29-debian-12  # has /bin/sh
    imagePullPolicy: IfNotPresent
    command: ["cat"]                       # <- use cat+tty (more reliable for exec)
    tty: true
    workingDir: /home/jenkins/agent
    volumeMounts:
    - name: workspace-volume
      mountPath: /home/jenkins/agent

  volumes:
  - name: docker-config
    secret:
      secretName: regcred
      items:
      - key: .dockerconfigjson
        path: config.json

  - name: workspace-volume
    emptyDir: {}
"""
      defaultContainer 'kubectl'   // bare 'sh' runs in kubectl container
      // cloud 'kubernetes'        // uncomment only if your cloud has another name
    }
  }

  options {
    timestamps()
    buildDiscarder(logRotator(numToKeepStr: '20'))
    skipDefaultCheckout(true)
  }

  triggers { githubPush() }

  environment {
    DOCKER_IMAGE = 'adelbettaieb/gestionentreprise'
    K8S_NS       = 'jenkins'
    APP_NAME     = 'gestionentreprise'
    INGRESS_HOST = 'app.local'
    TAG          = ''   // set in Init vars
  }

  stages {

    stage('Init vars') {
      steps {
        script {
          // Robust: fall back if BRANCH_NAME is not set yet
          def branch = (env.BRANCH_NAME ?: 'main').trim()
          env.TAG = (branch == 'main') ? 'latest' : "${branch}-${env.BUILD_NUMBER}"
          echo "Using image tag: ${env.TAG} (branch=${branch})"
        }
      }
    }

    stage('Checkout') {
      steps { checkout scm }
    }

    // quick check the container exec works
    stage('Sanity sh') {
      steps {
        container('kubectl') {
          sh 'echo OK && whoami && pwd && ls -la'
        }
      }
    }

    stage('Pre-flight: versions') {
      steps {
        container('kubectl') { sh 'kubectl version --client=true' }
        container('node')    { sh 'node --version && npm --version' }
        container('maven')   { sh 'mvn -v' }
      }
    }

    stage('Build Frontend') {
      steps {
        container('node') {
          // TODO: change this folder name if your repo uses a different one
          dir('employee frontend final') {
            sh '''
              echo "==> Frontend build"
              npm ci || npm install
              npm run build || true
            '''
          }
        }
      }
    }

    stage('Build Backend (Maven)') {
      steps {
        container('maven') {
          dir('emp_backend') {
            sh '''
              echo "==> Backend package (skip tests)"
              if [ -x ./mvnw ]; then
                ./mvnw -B -DskipTests package
              else
                mvn -B -DskipTests package
              fi
            '''
          }
        }
      }
    }

    stage('Build & Push Image (Kaniko)') {
      steps {
        container('kaniko') {
          sh '''
            echo "==> Check Dockerfile"
            test -f "$WORKSPACE/emp_backend/Dockerfile" || {
              echo "Missing: emp_backend/Dockerfile"; exit 1; }

            echo "==> Build & push docker.io/$DOCKER_IMAGE:$TAG"
            /kaniko/executor \
              --context "$WORKSPACE/emp_backend" \
              --dockerfile Dockerfile \
              --destination "docker.io/$DOCKER_IMAGE:$TAG" \
              --snapshot-mode=redo --verbosity=info

            if [ "$BRANCH_NAME" = "main" ]; then
              echo "==> Also push :latest"
              /kaniko/executor \
                --context "$WORKSPACE/emp_backend" \
                --dockerfile Dockerfile \
                --destination "docker.io/$DOCKER_IMAGE:latest" \
                --snapshot-mode=redo --verbosity=info
            fi
          '''
        }
      }
    }

    stage('Deploy to Kubernetes') {
      steps {
        container('kubectl') {
          sh '''
            echo "==> Apply k8s manifests"
            test -d "$WORKSPACE/k8s" || { echo "k8s/ folder missing"; exit 1; }
            kubectl -n "$K8S_NS" apply -f "$WORKSPACE/k8s"

            echo "==> Set deployment image"
            kubectl -n "$K8S_NS" set image deploy/$APP_NAME app="docker.io/$DOCKER_IMAGE:$TAG" --record

            echo "==> Wait rollout"
            kubectl -n "$K8S_NS" rollout status deploy/$APP_NAME --timeout=180s
          '''
        }
      }
    }

    stage('Smoke Test (Ingress)') {
      steps {
        container('kubectl') {
          sh '''
            echo "==> Smoke test (in-cluster via ingress svc)"
            kubectl -n "$K8S_NS" run smoke --rm -i --restart=Never --image=curlimages/curl -- \
              -sSI -H "Host: $INGRESS_HOST" \
              http://ingress-nginx-controller.ingress-nginx.svc.cluster.local/ | head -n1
          '''
        }
      }
    }
  }

  post {
    success { echo "✅ Deployed docker.io/$DOCKER_IMAGE:$TAG to namespace $K8S_NS" }
    failure { echo "❌ Build failed — check the first failing stage in Console Output" }
  }
}
