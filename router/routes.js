const express = require("express");
const router = express.Router();
const { exec } = require('child_process');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs');
const os = require('os');
const path = require('path');

const tempDir = path.join(os.tmpdir(), 'arduino-web-ide');

// Create temp directory if it doesn't exist
if (!fs.existsSync(tempDir)) {
  fs.mkdirSync(tempDir, { recursive: true });
}

function createSketchFile(code, sketchId) {
  const sketchDir = path.join(tempDir, sketchId);
  const sketchPath = path.join(sketchDir, `${sketchId}.ino`);
  
  if (!fs.existsSync(sketchDir)) {
    fs.mkdirSync(sketchDir, { recursive: true });
  }
  
  fs.writeFileSync(sketchPath, code);
  return { sketchDir, sketchPath };
}

// Compile Arduino code
router.post('/api/compile', (req, res) => {
    const { code, boardType } = req.body;
    
    if (!code || !boardType) {
      return res.status(400).json({ success: false, errors: 'Missing code or board type' });
    }
    
    const sketchId = uuidv4();
    const { sketchDir, sketchPath } = createSketchFile(code, sketchId);
    
    // Execute arduino-cli compile command
    const command = `arduino-cli compile --fqbn ${boardType} "${sketchPath}"`;
    
    exec(command, { cwd: sketchDir }, (error, stdout, stderr) => {
      if (error) {
        return res.json({ 
          success: false, 
          errors: stderr || stdout || 'Compilation failed'
        });
      }
      
      res.json({ 
        success: true, 
        output: stdout
      });
      
      // Clean up temporary files after a delay
      setTimeout(() => {
        try {
          fs.rmSync(sketchDir, { recursive: true, force: true });
        } catch (err) {
          console.error('Failed to clean up temporary files:', err);
        }
      }, 5000);
    });
  });
  
  // Upload Arduino code
  router.post('/api/upload', (req, res) => {
    const { code, boardType } = req.body;
    
    if (!code || !boardType) {
      return res.status(400).json({ success: false, errors: 'Missing code or board type' });
    }
    
    const sketchId = uuidv4();
    const { sketchDir, sketchPath } = createSketchFile(code, sketchId);
    
    // First compile the sketch
    const compileCommand = `arduino-cli compile --fqbn ${boardType} "${sketchPath}"`;
    
    exec(compileCommand, { cwd: sketchDir }, (compileError, compileStdout, compileStderr) => {
      if (compileError) {
        return res.json({ 
          success: false, 
          errors: compileStderr || compileStdout || 'Compilation failed'
        });
      }
      
      // Find available ports
      exec('arduino-cli board list', (portError, portStdout) => {
        if (portError) {
          return res.json({ 
            success: false, 
            errors: 'Failed to find Arduino boards'
          });
        }
        
        // Parse port output to find the correct port
        // Look specifically for Arduino Uno on COM19 based on the output
        const portLines = portStdout.split('\n');
        let port = null;
        
        console.log("Available ports:", portStdout);
        
        // First try to find an Arduino Uno specifically
        for (const line of portLines) {
          if (line.includes('Arduino Uno')) {
            const match = line.match(/^(\S+)/i);
            if (match && match[1]) {
              port = match[1];
              console.log(`Found Arduino Uno on port: ${port}`);
              break;
            }
          }
        }
        
        // If no Arduino Uno found, try any serial port
        if (!port) {
          for (const line of portLines) {
            if (line.includes('serial')) {
              const match = line.match(/^(\S+)/i);
              if (match && match[1]) {
                port = match[1];
                console.log(`No Arduino Uno found, using first serial port: ${port}`);
                break;
              }
            }
          }
        }
        
        if (!port) {
          return res.json({ 
            success: false, 
            errors: 'No Arduino board detected. Please connect your board to the computer.'
          });
        }
        
        // Upload the sketch
        const uploadCommand = `arduino-cli upload -p ${port} --fqbn ${boardType} "${sketchPath}"`;
        
        exec(uploadCommand, { cwd: sketchDir }, (uploadError, uploadStdout, uploadStderr) => {
          if (uploadError) {
            return res.json({ 
              success: false, 
              errors: uploadStderr || uploadStdout || 'Upload failed'
            });
          }
          
          res.json({ 
            success: true, 
            output: `Compilation output:\n${compileStdout}\n\nUpload output:\n${uploadStdout}`
          });
          
          // Clean up temporary files after a delay
          setTimeout(() => {
            try {
              fs.rmSync(sketchDir, { recursive: true, force: true });
            } catch (err) {
              console.error('Failed to clean up temporary files:', err);
            }
          }, 5000);
        });
      });
    });
  });
  


  module.exports = router