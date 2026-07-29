return {
  {
    'NeogitOrg/neogit',
    dependencies = { 'nvim-lua/plenary.nvim', 'sindrets/diffview.nvim' },
    keys = { { '<leader>g', function() require('neogit').open() end, desc = 'Neogit' } },
    config = function()
      require('neogit').setup({
        disable_line_numbers = false,
        disable_relative_line_numbers = false,
      })

      -- Neogit hardcodes wrap=false on its windows after setting filetype,
      -- so the override must be scheduled to run after that happens.
      vim.api.nvim_create_autocmd('FileType', {
        pattern = { 'NeogitStatus', 'NeogitDiffView', 'NeogitCommitView' },
        callback = function()
          vim.schedule(function()
            vim.wo.wrap = true
            vim.wo.linebreak = true
            vim.wo.breakindent = true
          end)
        end,
      })
    end,
  },
  {
    'lewis6991/gitsigns.nvim',
    event = 'BufWinEnter',
    opts = { current_line_blame = true },  -- who last touched this line
  },
}
