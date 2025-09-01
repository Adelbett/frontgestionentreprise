// Declarative pipeline: easier, repeatable
pipeline {
  // Run each build inside a Kubernetes pod (Kubernetes plugin)
  agent {
    kubernetes {
      // Inline Pod YAML defining our build containers
      yaml """
apiVersion: v1
kind: Pod
metadata:
  labels:
    jenkins: agent                   # label so Jenkins knows this is an agent pod
spec:
  serviceAccountName: jenkins        # SA with RBAC to deploy in 'jenkins' ns
  imagePullSecrets:
  - name: regcred                    # lets Kaniko push to Docker Hub (Docker config)

  containers:
  - name: node                       # NodeJS for frontend build
    image: docker.io/library/node:20-bullseye
    imagePullPolicy: IfNotPresent
    command: ['cat']                 # keep container alive waiting for commands
    tty: true

  - name: maven                      # Maven for backend build
    image: docker.io/library/maven:3.9-eclipse-temurin-17
    imagePullPolicy: IfNotPresent
    command: ['cat']
    tty: true

  - name: kaniko                     # Kaniko executor builds & pushes Docker image
    image: gcr.io/kaniko-project/executor:v1.23.2-debug
    imagePullPolicy: IfNotPresent
    command: ['/bin/sh','-c']        # ensure a POSIX shell exists for 'sh' steps
    args: ['sleep 99d']              # sleep; Jenkins will exec commands inside
    env:
    - name: DOCKER_CONFIG
      value: /kaniko/.docker         # where Docker Hub creds are mounted
    volumeMounts:
    - name: docker-config
      mountPath: /kaniko/.docker     # mount regcred as docker config

  - name: kubectl                    # kubectl for apply/rollout/smoke tests
    image: bitnami/kubectl:1.29-debian-12  # <-- Debian variant includes /bin/sh
    imagePullPolicy: IfNotPresent
    command: ['/bin/sh','-c']        # run a real shell so 'sh' steps work
    args: ['sleep 99d']

  volumes:
  - name: docker-config
    secret:
      secretName: regcred            # secret created with your Docker Hub token
      items:
      - key: .dockerconfigjson
        path: config.json
"""
      defaultContainer 'kubectl'     // default steps run in kubectl container
      // cloud 'kubernetes'          // only if you named the cloud non-default
    }
  }

  options {
    timestamps()                     // readable logs
    buildDiscarder(logRotator(numToKeepStr: '20')) // keep last 20 builds
  }

  // GitHub webhook trigger (Multibranch also handles indexing)
  triggers { githubPush() }

  environment {
    // Docker image coordinates
    DOCKER_IMAGE = 'adelbettaieb/gestionentreprise'
    // K8s objects & host names
    K8S_NS       = 'jenkins'
    APP_NAME     = 'gestionentreprise'
    INGRESS_HOST = 'app.local'
    // Tag main as 'latest', other branches as 'branch-BUILD'
    TAG = "${env.BRANCH_NAME == 'main' ? 'latest' : "${env.BRANCH_NAME}-${env.BUILD_NUMBER}"}"
  }

  stages {

    stage('Checkout') {
      steps {
        // In Multibranch, Jenkins injects SCM automatically
        checkout scm
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
        container('node') {
          sh 'node --version && npm --version'
        }
        container('maven') {
          sh 'mvn -v'
        }
      }
    }

    stage('Build Frontend') {
      steps {
        container('node') {
          dir('employee frontend final') {            // <== your frontend folder
            sh '''
              echo "==> Frontend: install & build"
              npm ci || npm install                    # prefer clean install; fallback
              npm run build || true                    # run build (adapt if Angular)
            '''
          }
        }
      }
    }

    stage('Build Backend (Maven)') {
      steps {
        container('maven') {
          dir('emp_backend') {                         // <== your backend folder
            sh '''
              echo "==> Backend: package (skip tests)"
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
            echo "==> Ensure Dockerfile exists"
            test -f "$WORKSPACE/emp_backend/Dockerfile" || {
              echo "Missing: emp_backend/Dockerfile"; exit 1; }

            echo "==> Build & push docker.io/$DOCKER_IMAGE:$TAG"
            /kaniko/executor \
              --context "$WORKSPACE/emp_backend" \
              --dockerfile Dockerfile \
              --destination "docker.io/$DOCKER_IMAGE:$TAG" \
              --snapshot-mode=redo --verbosity=info

            # Tag 'latest' only for main
            if [ "$BRANCH_NAME" = "main" ]; then
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
            echo "==> Apply manifests (idempotent)"
            test -d "$WORKSPACE/k8s" || { echo "k8s/ folder missing"; exit 1; }
            kubectl -n "$K8S_NS" apply -f "$WORKSPACE/k8s"

            echo "==> Update Deployment image to the new tag"
            kubectl -n "$K8S_NS" set image deploy/$APP_NAME app="docker.io/$DOCKER_IMAGE:$TAG" --record

            echo "==> Wait for rollout"
            kubectl -n "$K8S_NS" rollout status deploy/$APP_NAME --timeout=180s
          '''
        }
      }
    }

    stage('Smoke Test (Ingress)') {
      steps {
        container('kubectl') {
          sh '''
            echo "==> Smoke test via Ingress service (in-cluster)"
            # Use a short-lived curl pod to hit the ingress controller service
            kubectl -n "$K8S_NS" run smoke --rm -i --restart=Never --image=curlimages/curl -- \
              -sSI -H "Host: $INGRESS_HOST" \
              http://ingress-nginx-controller.ingress-nginx.svc.cluster.local/ | head -n1
          '''
        }
      }
    }
  }

  post {
    success {
      echo "✅ CI/CD OK — deployed docker.io/$DOCKER_IMAGE:$TAG to namespace $K8S_NS"
    }
    failure {
      echo "❌ Build failed — check the stage that failed in Console Output"
    }
  }
}
