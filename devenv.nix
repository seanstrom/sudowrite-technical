{ pkgs, lib, config, inputs, ... }:

let 
  nodejs = pkgs.nodejs_26;
  pnpm = pkgs.pnpm_11.override { nodejs = nodejs; };
in
{
  packages = [
    pnpm
    nodejs
  ];
}
