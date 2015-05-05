/*
 * DSS
 * https://github.com/darcyclarke/DSS
 *
 * Copyright (c) 2013 darcyclarke
 * Licensed under the MIT license.
 */

// Include dependancies
var handlebars = require('handlebars');
var dss = require('dss');
var extend = require('util')._extend;

// Expose
module.exports = function(grunt){

  // Register DSS
  grunt.registerMultiTask('dss', 'Parse DSS comment blocks', function(){

    // Setup async promise
    var promise = this.async();

    // Merge task-specific and/or target-specific options with defaults
    var options = this.options({
      template: __dirname + '/../template/',
      template_index: 'index.handlebars',
      output_index: 'index.html',
      include_empty_files: true,
      arrange_by_sections: false
    });

    // Output options if --verbose cl option is passed
    grunt.verbose.writeflags(options, 'Options');

    // Describe custom parsers
    for (key in options.parsers){
      dss.parser(key, options.parsers[key]);
    }

    // Build Documentation
    this.files.forEach(function(f) {

      // Filter files based on their existence
      var src = f.src.filter(function(filepath) {

        // Warn on and remove invalid source files (if nonull was set).
        if (!grunt.file.exists(filepath)) {
          grunt.log.warn('Source file "' + filepath + '" not found.');
          return false;
        } else {
          return true;
        }
      });

      // Setup
      var files = src,
          template_dir = options.template,
          output_dir = f.dest,
          length = files.length,
          styleguide = [];

      // Function to rearrange the style guide by @toc section tags,
      // e.g. @toc 1.1.3. Enable by passing arrange_by_sections: true
      // in the configuration options.
      var arrangeBySections = function (styleguide, filename) {
        var blocks = [];

        for (var i = 0; i < styleguide.length; i++) {
          var nextFile = styleguide[i];
          // If a file contains no blocks, ignore it
          if (!nextFile.hasOwnProperty('blocks')) {
            continue;
          }

          for (var j = 0; j < nextFile.blocks.length; j++) {
            var nextBlock = nextFile.blocks[j];

            // For each block, extract only those that have @toc attributes
            if (nextBlock.hasOwnProperty('toc')) {
              blocks.push(nextBlock);
            }
          }
        }

        // Sort the blocks by their major and minor version numbers
        blocks = blocks.sort(function (a, b) {
          var aM = parseInt(a.toc.major);
          var bM = parseInt(b.toc.major);
          var semVerCompare = function cmp(a, b) {
            var pa = a.split('.');
            var pb = b.split('.');
            for (var i = 0; i < 3; i++) {
              var na = Number(pa[i]);
              var nb = Number(pb[i]);
              if (na > nb) return 1;
              if (nb > na) return -1;
              if (!isNaN(na) && isNaN(nb)) return 1;
              if (isNaN(na) && !isNaN(nb)) return -1;
            }
            return 0;
          };

          // Attempt to sort by major version number first
          if (aM < bM) {
            return -1;
          } else if (aM > bM) {
            return 1;
          } else {
            // If major version #s are the same, use the full semver ID
            return semVerCompare(a.toc.id, b.toc.id);
          }
          return 0;
        });

        return [{
          blocks: blocks,
          file: filename
        }];
      }

      // Parse files
      files.map(function(filename){

        // Report file
        grunt.verbose.writeln('• ' + grunt.log.wordlist([filename], {color: 'cyan'}));

        // Parse
        dss.parse(grunt.file.read(filename), { file: filename }, function(parsed) {

          // Continue only if file contains DSS annotation
          if (options.include_empty_files || parsed.blocks.length) {
            // Add filename
            parsed['file'] = filename;

            // Add comment block to styleguide
            styleguide.push(parsed);
          }

          // Check if we're done
          if (length > 1) {
            length--;
          }
          else {
            // Set output template and file
            var template_filepath = template_dir + options.template_index,
                output_filepath = output_dir + options.output_index;

            if (!grunt.file.exists(template_filepath)) {
              grunt.fail.fatal('Cannot read the template file');
            }

            // copy template assets (except index.handlebars)
            grunt.file.expandMapping([
              '**/*',
              '!' + options.template_index
            ], output_dir, { cwd: template_dir }).forEach(function(filePair) {
              filePair.src.forEach(function(src) {
                if (grunt.file.isDir(src)) {
                  grunt.verbose.writeln('Creating ' + filePair.dest.cyan);
                  grunt.file.mkdir(filePair.dest);
                } else {
                  grunt.verbose.writeln('Copying ' + src.cyan + ' -> ' + filePair.dest.cyan);
                  grunt.file.copy(src, filePair.dest);
                }
              });
            });

            if (options.arrange_by_sections) {
              styleguide = arrangeBySections(styleguide, 'app.css');
            }

            if (options.write_output_file) {
              grunt.file.write( 'output.json', JSON.stringify(styleguide) );
            }

            // Add helper for markupExamples
            handlebars.registerHelper('render_subtemplate', function(markup, options) {
              // we need the sub template compiled here
              // in order to be able to generate the top level template
              var subTemplate =  handlebars.compile( markup );
              var subTemplateContext = extend(this, options.hash);
              return new handlebars.SafeString( subTemplate(subTemplateContext) );
            });

            // Create HTML ouput
            var html = handlebars.compile(grunt.file.read(template_filepath))({
              project: grunt.file.readJSON('package.json'),
              files: styleguide
            });

            var output_type = 'created', output = null;
            if (grunt.file.exists(output_filepath)) {
              output_type = 'overwritten';
              output = grunt.file.read(output_filepath);
            }
            // avoid write if there is no change
            if (output !== html) {
              // Render file
              grunt.file.write(output_filepath, html);

              // Report build
              grunt.log.writeln('✓ Styleguide ' + output_type + ' at: ' + grunt.log.wordlist([output_dir], {color: 'cyan'}));
            }
            else {
              // no change
              grunt.log.writeln('‣ Styleguide unchanged');
            }

            // Return promise
            promise();

          }
        });

      });

    });

  });

};
