// Declarative pipeline: easier, repeatable
pipeline {
  // Run each build inside a Kubernetes pod (via Kubernetes plugin)
  agent {
    kubernetes {
      // Inline Pod YAML: defines the build containers the pipeline will use
      yaml """
apiVersion: v1
kind: Pod
metadata:
  labels:
    jenkins: agent                         # mark this pod as a Jenkins agent
spec:
  serviceAccountName: jenkins              # SA with RBAC in 'jenkins' ns
  imagePullSecrets:
  - name: regcred                          # Docker Hub auth for Kaniko pushes

  containers:
  # ---- Frontend builder (Node) ----
  - name: node
    image: docker.io/library/node:20-bullseye
    imagePullPolicy: IfNotPresent
    command: ['cat']                       # keep container alive; Jenkins execs into it
    tty: true                              # allow interactive shell steps

  # ---- Backend builder (Maven/Java 17) ----
  - name: maven
    image: docker.io/library/maven:3.9-eclipse-temurin-17
    imagePullPolicy: IfNotPresent
    command: ['cat']
    tty: true

  # ---- Image builder (Kaniko) ----
  - name: kaniko
    image: gcr.io/kaniko-project/executor:v1.23.2-debug
    imagePullPolicy: IfNotPresent
    command: ['/bin/sh','-c']              # real shell so 'sh' steps work
    args: ['sleep 99d']                    # idle; Jenkins will run commands inside
    tty: true
    env:
    - name: DOCKER_CONFIG
      value: /kaniko/.docker               # where Docker auth is mounted
    volumeMounts:
    - name: docker-config                  # mount your Docker Hub secret
      mountPath: /kaniko/.docker

  # ---- kubectl for deploy & smoke tests ----
  - name: kubectl
    image: bitnami/kubectl:1.29-debian-12  # Debian variant includes /bin/sh
    imagePullPolicy: IfNotPresent
    command: ['/bin/sh','-c']
    args: ['sleep 99d']
    tty: true

  # ---- volumes ----
  volumes:
  - name: docker-config
    secret:
      secretName: regcred                  # created with: kubectl create secret docker-registry ...
      items:
      - key: .dockerconfigjson
        path: config.json
"""
      defaultContainer 'kubectl'           // steps without container(...) run here
      // cloud 'kubernetes'                // only if your Cloud name is not default
    }
  }

  options {
    timestamps()                           // readable logs with timestamps
    buildDiscarder(logRotator(numToKeepStr: '20')) // keep last 20 builds
    // ansiColor('xterm')                  // uncomment if you want colored logs
  }

  // GitHub webhook trigger (Multibranch also handles indexing)
  triggers { githubPush() }

  environment {
    // Docker image coordinates
    DOCKER_IMAGE = 'adelbettaieb/gestionentreprise'
    // K8s objects & host names
    K8S_NS       = 'jenkins'
    APP_NAME     = 'gestionentreprise'
    INGRESS_HOST = 'app.local'             // must match your app Ingress host
    // Tag: main → latest, others → <branch>-<build>
    TAG = "${env.BRANCH_NAME == 'main' ? 'latest' : "${env.BRANCH_NAME}-${env.BUILD_NUMBER}"}"
  }

  stages {

    stage('Checkout') {
      steps {
        // Multibranch injects SCM; this checks out the current branch commit
        checkout scm
        sh 'echo "Checked out: $(git rev-parse --short HEAD)"'
      }
    }

    stage('Pre-flight: versions') {
      steps {
        container('kubectl') {
          sh '''
            echo "==> kubectl version"
            kubectl version --client=true
          '''
        }
        container('node')   { sh 'node --version && npm --version' }
        container('maven')  { sh 'mvn -v' }
      }
    }

    stage('Build Frontend') {
      steps {
        container('node') {
          // ⚠️ Make sure this folder name matches your repo exactly.
          dir('employee frontend final') {
            sh '''
              echo "==> Frontend: install & build"
              # Prefer clean install; fallback to npm install if lockfile missing
              npm ci || npm install
              # If your project is Angular, npm run build usually calls ng build
              npm run build --if-present
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
              echo "==> Backend: package (skip tests)"
              if [ -x ./mvnw ]; then
                ./mvnw -B -DskipTests package
              else
                mvn    -B -DskipTests package
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
            echo "==> Ensure Dockerfile exists"
            test -f "$WORKSPACE/emp_backend/Dockerfile" || {
              echo "Missing: emp_backend/Dockerfile"; exit 1; }

            echo "==> Build & push docker.io/$DOCKER_IMAGE:$TAG"
            /kaniko/executor \
              --context   "$WORKSPACE/emp_backend" \
              --dockerfile Dockerfile \
              --destination "docker.io/$DOCKER_IMAGE:$TAG" \
              --snapshot-mode=redo --verbosity=info

            if [ "$BRANCH_NAME" = "main" ]; then
              echo "==> Also tag :latest for main"
              /kaniko/executor \
                --context   "$WORKSPACE/emp_backend" \
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
            echo "==> Apply manifests (idempotent)"
            test -d "$WORKSPACE/k8s" || { echo "k8s/ folder missing"; exit 1; }
            kubectl -n "$K8S_NS" apply -f "$WORKSPACE/k8s"

            echo "==> Set deployment image to new tag"
            kubectl -n "$K8S_NS" set image deploy/$APP_NAME app="docker.io/$DOCKER_IMAGE:$TAG" --record

            echo "==> Wait for rollout to finish"
            kubectl -n "$K8S_NS" rollout status deploy/$APP_NAME --timeout=180s
          '''
        }
      }
    }

    stage('Smoke Test (Ingress)') {
      steps {
        container('kubectl') {
          sh '''
            echo "==> Smoke test through ingress-nginx service (in-cluster)"
            kubectl -n "$K8S_NS" run smoke --rm -i --restart=Never --image=curlimages/curl -- \
              -fsSI -H "Host: $INGRESS_HOST" \
              http://ingress-nginx-controller.ingress-nginx.svc.cluster.local/ | head -n1
          '''
        }
      }
    }
  }

  post {
    success {
      echo "✅ CI/CD OK — deployed docker.io/$DOCKER_IMAGE:$TAG to namespace $K8S_NS"
      container('kubectl') {
        sh 'kubectl -n "$K8S_NS" get deploy,svc,ingress && kubectl -n "$K8S_NS" get pods -o wide'
      }
    }
    failure {
      echo "❌ Build failed — check the stage that failed in Console Output"
      // Helpful debug on failure
      container('kubectl') {
        sh '''
          set +e
          echo "==> Current pods"
          kubectl -n "$K8S_NS" get pods -o wide
          echo "==> Last 100 logs from deployment"
          kubectl -n "$K8S_NS" logs deploy/$APP_NAME --tail=100 || true
        '''
      }
    }
  }
}
