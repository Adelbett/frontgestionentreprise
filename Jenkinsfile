pipeline {
  agent {
    kubernetes {
      yaml """
apiVersion: v1
kind: Pod
spec:
  containers:
  - name: node
    image: node:20-alpine
    command: ['cat']
    tty: true
  - name: maven
    image: maven:3.9-eclipse-temurin-21
    command: ['cat']
    tty: true
"""
    }
  }
  options { timestamps() }

  stages {
    stage('Checkout') {
      steps { checkout scm }
    }

    stage('Build frontend') {
      when { expression { fileExists('employee frontend final/package.json') } }
      steps {
        container('node') {
          dir('employee frontend final') {
            sh 'npm ci'
            sh 'npm run build --if-present'
          }
        }
      }
    }

    stage('Build backend') {
      when { expression { fileExists('emp_backend/pom.xml') } }
      steps {
        container('maven') {
          sh 'mvn -f emp_backend/pom.xml -B -DskipTests package'
        }
      }
    }

    stage('Archive artifacts') {
      steps {
        archiveArtifacts allowEmptyArchive: true, artifacts: '''
employee frontend final/build/**,
employee frontend final/dist/**,
emp_backend/target/*.jar
'''.trim()
      }
    }
  }

  post { always { cleanWs() } }
}
